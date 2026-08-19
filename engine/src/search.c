/* Iterative deepening alpha-beta with a transposition table, quiescence
   search and the usual pruning heuristics.

   Playing strength is dialled down (see SearchLimits) with three knobs:
   a node cap, evaluation noise, and softmax sampling among the root moves.
   The node cap is the primary one because it makes strength independent of
   how fast the player's device happens to be. */
#include "chess.h"

#include <stdlib.h>
#include <string.h>
#include <sys/time.h>

#define MATE_SCORE 30000
#define MATE_IN_MAX (MATE_SCORE - MAX_PLY)
#define INF_SCORE 32000

enum { TT_NONE = 0, TT_EXACT, TT_LOWER, TT_UPPER };

typedef struct {
    uint64_t key;
    Move move;
    int16_t score;
    uint8_t depth;
    uint8_t flag;
} TTEntry;

static TTEntry *tt = NULL;
static size_t tt_count = 0;
static size_t tt_mask = 0;

static SearchLimits limits;
static uint64_t nodes;
static int stop_search;
static int64_t start_ms;
static uint64_t noise_salt;
static uint64_t rng_state = 0x853C49E6748FEA9BULL;

static Move killers[MAX_PLY][2];
static int history[COLOR_NB][64][64];

static Move pv_table[MAX_PLY][MAX_PLY];
static int pv_length[MAX_PLY];

typedef struct {
    Move move;
    int score;
} RootMove;

static int64_t now_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

void search_set_seed(uint64_t seed) { rng_state = seed ? seed : 0x853C49E6748FEA9BULL; }

uint64_t search_rand(void) {
    rng_state ^= rng_state >> 12;
    rng_state ^= rng_state << 25;
    rng_state ^= rng_state >> 27;
    return rng_state * 2685821657736338717ULL;
}

void search_init(int tt_mb) {
    if (tt_mb < 1) tt_mb = 1;
    size_t bytes = (size_t)tt_mb * 1024 * 1024;
    size_t count = 1;
    while (count * 2 * sizeof(TTEntry) <= bytes) count *= 2;

    free(tt);
    tt = (TTEntry *)calloc(count, sizeof(TTEntry));
    tt_count = tt ? count : 0;
    tt_mask = tt_count ? tt_count - 1 : 0;
}

void search_new_game(void) {
    if (tt) memset(tt, 0, tt_count * sizeof(TTEntry));
    memset(history, 0, sizeof(history));
    memset(killers, 0, sizeof(killers));
}

static inline int should_stop(void) {
    if (stop_search) return 1;
    if (limits.max_nodes && nodes >= limits.max_nodes) {
        stop_search = 1;
        return 1;
    }
    if (limits.max_time_ms && (nodes & 2047) == 0 && now_ms() - start_ms >= limits.max_time_ms) {
        stop_search = 1;
        return 1;
    }
    return 0;
}

/* Deterministic per-position jitter: constant within a search, so the tree
   stays internally consistent and transposition entries remain valid. */
static int noisy_eval(const Position *pos) {
    int score = evaluate(pos);
    if (!limits.noise_cp) return score;

    uint64_t h = pos->key ^ noise_salt;
    h ^= h >> 33;
    h *= 0xFF51AFD7ED558CCDULL;
    h ^= h >> 33;
    int span = 2 * limits.noise_cp + 1;
    return score + (int)(h % (uint64_t)span) - limits.noise_cp;
}

static void tt_store(uint64_t key, int depth, int score, int flag, Move move, int ply) {
    if (!tt_count) return;
    TTEntry *e = &tt[key & tt_mask];

    /* Prefer deeper entries, but always overwrite a different position. */
    if (e->key == key && e->depth > depth && flag != TT_EXACT) return;

    if (score >= MATE_IN_MAX) score += ply;
    else if (score <= -MATE_IN_MAX) score -= ply;

    e->key = key;
    e->depth = (uint8_t)(depth < 0 ? 0 : depth);
    e->score = (int16_t)score;
    e->flag = (uint8_t)flag;
    if (move != MOVE_NONE || e->key != key) e->move = move;
}

static int tt_probe(uint64_t key, int depth, int alpha, int beta, int ply, int *score, Move *move) {
    if (!tt_count) return 0;
    TTEntry *e = &tt[key & tt_mask];
    if (e->key != key) return 0;

    *move = e->move;
    if (e->depth < depth) return 0;

    int s = e->score;
    if (s >= MATE_IN_MAX) s -= ply;
    else if (s <= -MATE_IN_MAX) s += ply;

    if (e->flag == TT_EXACT) {
        *score = s;
        return 1;
    }
    if (e->flag == TT_LOWER && s >= beta) {
        *score = s;
        return 1;
    }
    if (e->flag == TT_UPPER && s <= alpha) {
        *score = s;
        return 1;
    }
    return 0;
}

static const int MVV_VALUE[7] = {100, 320, 330, 500, 900, 20000, 0};

static void score_moves(const Position *pos, MoveList *list, int *scores, Move tt_move, int ply) {
    for (int i = 0; i < list->count; i++) {
        Move m = list->moves[i];
        if (m == tt_move) {
            scores[i] = 1 << 24;
            continue;
        }

        int to = mv_to(m);
        int captured = pos->board[to];
        int is_capture = captured != EMPTY || mv_flag(m) == FLAG_EP;

        if (is_capture || mv_promo(m)) {
            int see = eval_see(pos, m);
            int victim = mv_flag(m) == FLAG_EP ? PAWN : (captured == EMPTY ? 6 : PIECE_TYPE(captured));
            int attacker = PIECE_TYPE(pos->board[mv_from(m)]);
            int mvv_lva = MVV_VALUE[victim] * 16 - MVV_VALUE[attacker] / 16;
            /* Losing captures are searched after quiet moves. */
            scores[i] = see >= 0 ? (1 << 22) + mvv_lva : mvv_lva - (1 << 22);
            if (mv_promo(m) == QUEEN) scores[i] += 1 << 21;
            continue;
        }

        if (m == killers[ply][0]) scores[i] = 1 << 20;
        else if (m == killers[ply][1]) scores[i] = (1 << 20) - 1;
        else scores[i] = history[pos->side][mv_from(m)][to];
    }
}

/* Selection sort one move at a time: most searches cut off early, so sorting
   the whole list up front is wasted work. */
static void pick_move(MoveList *list, int *scores, int index) {
    int best = index;
    for (int i = index + 1; i < list->count; i++)
        if (scores[i] > scores[best]) best = i;
    if (best == index) return;

    Move tmp_move = list->moves[index];
    list->moves[index] = list->moves[best];
    list->moves[best] = tmp_move;
    int tmp_score = scores[index];
    scores[index] = scores[best];
    scores[best] = tmp_score;
}

static int quiescence(Position *pos, int alpha, int beta, int ply) {
    if (should_stop()) return 0;
    nodes++;

    if (ply >= MAX_PLY - 1) return noisy_eval(pos);

    int in_check = pos_in_check(pos, pos->side);
    int stand_pat = -INF_SCORE;

    if (!in_check) {
        stand_pat = noisy_eval(pos);
        if (stand_pat >= beta) return stand_pat;
        if (stand_pat > alpha) alpha = stand_pat;
    }

    MoveList list;
    /* When in check, evasions must all be considered or the score is nonsense. */
    if (in_check) gen_pseudo(pos, &list);
    else gen_pseudo_captures(pos, &list);

    int scores[MAX_MOVES];
    score_moves(pos, &list, scores, MOVE_NONE, ply);

    int best = stand_pat;
    int legal = 0;

    for (int i = 0; i < list.count; i++) {
        pick_move(&list, scores, i);
        Move m = list.moves[i];

        if (!in_check) {
            /* Skip captures that lose material outright, and hopeless ones. */
            if (eval_see(pos, m) < 0) continue;
            int victim = mv_flag(m) == FLAG_EP ? PAWN : PIECE_TYPE(pos->board[mv_to(m)]);
            if (stand_pat + MVV_VALUE[victim] + 200 < alpha && !mv_promo(m)) continue;
        }

        Undo u;
        if (!pos_do_move(pos, m, &u)) continue;
        legal++;
        int score = -quiescence(pos, -beta, -alpha, ply + 1);
        pos_undo_move(pos, m, &u);

        if (stop_search) return 0;
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
    }

    if (in_check && legal == 0) return -MATE_SCORE + ply;
    return best;
}

static int negamax(Position *pos, int depth, int alpha, int beta, int ply, int can_null) {
    if (should_stop()) return 0;

    int is_pv = beta - alpha > 1;
    pv_length[ply] = ply;

    if (ply > 0) {
        if (pos_is_repetition(pos, ply) || pos->halfmove >= 100 || pos_insufficient_material(pos))
            return 0;

        /* Mate distance pruning. */
        int mate_alpha = alpha > -MATE_SCORE + ply ? alpha : -MATE_SCORE + ply;
        int mate_beta = beta < MATE_SCORE - ply - 1 ? beta : MATE_SCORE - ply - 1;
        if (mate_alpha >= mate_beta) return mate_alpha;
        alpha = mate_alpha;
        beta = mate_beta;
    }

    if (ply >= MAX_PLY - 1) return noisy_eval(pos);

    int in_check = pos_in_check(pos, pos->side);
    if (in_check) depth++;

    if (depth <= 0) return quiescence(pos, alpha, beta, ply);

    nodes++;

    Move tt_move = MOVE_NONE;
    int tt_score;
    if (ply > 0 && tt_probe(pos->key, depth, alpha, beta, ply, &tt_score, &tt_move))
        return tt_score;
    if (tt_move != MOVE_NONE && !move_is_pseudo_legal(pos, tt_move)) tt_move = MOVE_NONE;

    int static_eval = in_check ? -INF_SCORE : noisy_eval(pos);

    if (!is_pv && !in_check) {
        /* Reverse futility: the position is so good that even a big concession
           keeps us above beta. */
        if (depth <= 6 && static_eval - 85 * depth >= beta && beta > -MATE_IN_MAX)
            return static_eval;

        /* Null move: give the opponent a free move; if we are still winning,
           this node is unlikely to matter. */
        if (can_null && depth >= 3 && static_eval >= beta &&
            pos_has_non_pawn_material(pos, pos->side)) {
            int reduction = 2 + depth / 6;
            Undo u;
            pos_do_null(pos, &u);
            int score = -negamax(pos, depth - 1 - reduction, -beta, -beta + 1, ply + 1, 0);
            pos_undo_null(pos, &u);
            if (stop_search) return 0;
            if (score >= beta) return score >= MATE_IN_MAX ? beta : score;
        }
    }

    MoveList list;
    gen_pseudo(pos, &list);
    int scores[MAX_MOVES];
    score_moves(pos, &list, scores, tt_move, ply);

    Move best_move = MOVE_NONE;
    int best_score = -INF_SCORE;
    int original_alpha = alpha;
    int legal = 0;
    Move quiets[MAX_MOVES];
    int quiet_count = 0;

    for (int i = 0; i < list.count; i++) {
        pick_move(&list, scores, i);
        Move m = list.moves[i];

        int to = mv_to(m);
        int is_capture = pos->board[to] != EMPTY || mv_flag(m) == FLAG_EP;
        int is_quiet = !is_capture && !mv_promo(m);

        /* Late move pruning: deep in the move list at shallow depth, quiet
           moves are very unlikely to be best. */
        if (!is_pv && !in_check && is_quiet && depth <= 4 && legal > 0 &&
            i >= 6 + depth * depth && best_score > -MATE_IN_MAX)
            continue;

        Undo u;
        if (!pos_do_move(pos, m, &u)) continue;
        legal++;
        if (is_quiet && quiet_count < MAX_MOVES) quiets[quiet_count++] = m;

        int score;
        int new_depth = depth - 1;

        if (legal == 1) {
            score = -negamax(pos, new_depth, -beta, -alpha, ply + 1, 1);
        } else {
            /* Late move reduction for quiet moves ordered late. */
            int reduction = 0;
            if (is_quiet && depth >= 3 && legal > 3 && !in_check) {
                reduction = 1 + (legal > 6) + (depth >= 6);
                if (is_pv && reduction > 1) reduction--;
                if (new_depth - reduction < 1) reduction = new_depth - 1;
                if (reduction < 0) reduction = 0;
            }

            score = -negamax(pos, new_depth - reduction, -alpha - 1, -alpha, ply + 1, 1);
            if (score > alpha && reduction > 0)
                score = -negamax(pos, new_depth, -alpha - 1, -alpha, ply + 1, 1);
            if (score > alpha && score < beta)
                score = -negamax(pos, new_depth, -beta, -alpha, ply + 1, 1);
        }

        pos_undo_move(pos, m, &u);
        if (stop_search) return 0;

        if (score > best_score) {
            best_score = score;
            best_move = m;

            if (score > alpha) {
                alpha = score;
                pv_table[ply][ply] = m;
                for (int j = ply + 1; j < pv_length[ply + 1]; j++)
                    pv_table[ply][j] = pv_table[ply + 1][j];
                pv_length[ply] = pv_length[ply + 1];

                if (alpha >= beta) {
                    if (is_quiet) {
                        if (killers[ply][0] != m) {
                            killers[ply][1] = killers[ply][0];
                            killers[ply][0] = m;
                        }
                        history[pos->side][mv_from(m)][to] += depth * depth;
                        /* Penalise the quiet moves that failed before it. */
                        for (int q = 0; q < quiet_count - 1; q++)
                            history[pos->side][mv_from(quiets[q])][mv_to(quiets[q])] -= depth;
                    }
                    break;
                }
            }
        }
    }

    if (legal == 0) return in_check ? -MATE_SCORE + ply : 0;

    int flag = best_score >= beta ? TT_LOWER : (best_score > original_alpha ? TT_EXACT : TT_UPPER);
    tt_store(pos->key, depth, best_score, flag, best_move, ply);
    return best_score;
}

static int compare_root(const void *a, const void *b) {
    const RootMove *ra = (const RootMove *)a, *rb = (const RootMove *)b;
    if (ra->score != rb->score) return rb->score - ra->score;
    /* Tie-break on the move itself so ordering is reproducible run to run. */
    return ra->move < rb->move ? -1 : (ra->move > rb->move);
}

void search_run(Position *pos, const SearchLimits *lim, SearchResult *result) {
    limits = *lim;
    nodes = 0;
    stop_search = 0;
    start_ms = now_ms();
    noise_salt = search_rand();

    memset(pv_table, 0, sizeof(pv_table));
    memset(pv_length, 0, sizeof(pv_length));
    memset(killers, 0, sizeof(killers));
    for (int c = 0; c < COLOR_NB; c++)
        for (int f = 0; f < 64; f++)
            for (int t = 0; t < 64; t++) history[c][f][t] /= 8;

    memset(result, 0, sizeof(*result));

    MoveList legal;
    gen_legal(pos, &legal);
    if (legal.count == 0) return;

    RootMove roots[MAX_MOVES];
    for (int i = 0; i < legal.count; i++) {
        roots[i].move = legal.moves[i];
        roots[i].score = -INF_SCORE;
    }
    int root_count = legal.count;

    result->best = roots[0].move;

    int max_depth = limits.max_depth > 0 && limits.max_depth < MAX_PLY - 2 ? limits.max_depth
                                                                          : MAX_PLY - 2;

    RootMove completed[MAX_MOVES];
    int completed_count = 0;

    for (int depth = 1; depth <= max_depth; depth++) {
        RootMove iteration[MAX_MOVES];
        Move iter_pv[MAX_PLY];
        int iter_pv_len = 0;
        int alpha = -INF_SCORE;
        int finished = 1;
        int count = 0;
        Move iter_best = MOVE_NONE;

        for (int i = 0; i < root_count; i++) {
            Move m = roots[i].move;
            Undo u;
            if (!pos_do_move(pos, m, &u)) continue;

            int score;
            if (count == 0) {
                score = -negamax(pos, depth - 1, -INF_SCORE, INF_SCORE, 1, 1);
            } else {
                score = -negamax(pos, depth - 1, -alpha - 1, -alpha, 1, 1);
                if (score > alpha) score = -negamax(pos, depth - 1, -INF_SCORE, -alpha, 1, 1);
            }
            pos_undo_move(pos, m, &u);

            if (stop_search) {
                finished = 0;
                break;
            }

            iteration[count].move = m;
            iteration[count].score = score;

            /* Root PV is this move followed by the child's PV. */
            if (score > alpha || count == 0) {
                alpha = score;
                iter_best = m;
                iter_pv[0] = m;
                iter_pv_len = 1;
                for (int j = 1; j < pv_length[1] && iter_pv_len < MAX_PLY; j++)
                    iter_pv[iter_pv_len++] = pv_table[1][j];
                result->best = m;
            }
            count++;
        }

        if (!finished || count == 0) break;

        memcpy(completed, iteration, sizeof(RootMove) * (size_t)count);
        completed_count = count;
        qsort(completed, (size_t)completed_count, sizeof(RootMove), compare_root);

        /* Scores of moves that failed low are upper bounds, not exact, so they
           can tie with the best move's score. Keep the move that actually
           raised alpha in front regardless of how the sort broke the tie. */
        for (int i = 1; i < completed_count; i++) {
            if (completed[i].move != iter_best) continue;
            RootMove tmp = completed[0];
            completed[0] = completed[i];
            completed[i] = tmp;
            break;
        }

        memcpy(roots, completed, sizeof(RootMove) * (size_t)completed_count);
        root_count = completed_count;

        result->best = completed[0].move;
        result->score = completed[0].score;
        result->depth = depth;
        result->nodes = nodes;
        result->time_ms = (int)(now_ms() - start_ms);
        result->pv_len = iter_pv_len;
        for (int i = 0; i < iter_pv_len; i++) result->pv[i] = iter_pv[i];
        if (result->pv_len == 0) {
            result->pv[0] = completed[0].move;
            result->pv_len = 1;
        }

        search_report(pos, result);

        if (completed[0].score >= MATE_IN_MAX || completed[0].score <= -MATE_IN_MAX) break;
        if (limits.max_nodes && nodes >= limits.max_nodes) break;
        if (limits.max_time_ms && now_ms() - start_ms >= limits.max_time_ms / 2) break;
    }

    if (completed_count > 0) result->best = completed[0].move;
    result->nodes = nodes;
    result->time_ms = (int)(now_ms() - start_ms);

    /* A final report so callers see the real totals, not just the work done up
       to the last iteration that managed to finish. */
    if (result->depth > 0) search_report(pos, result);
}

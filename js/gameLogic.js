// js/gameLogic.js
// Core rules engine and state manipulation for King Collapse.
// This module is now a pure "rules engine" with no UI dependencies.
// It takes a game state, performs calculations, and returns the new state and a list of resulting events.

import logger from "./logger.js";

/**
 * Checks if a square is within the 8x8 board.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/**
 * Creates the initial state of the game board and pieces.
 * @returns {{pieces: object, boardState: Array<Array<string|null>>}}
 */
export function createInitialState() {
    const pieces = {};
    const boardState = Array(8).fill(null).map(() => Array(8).fill(null));
    let redCounter = 1, blackCounter = 1;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) { // Dark squares only
                let player = null, id = null;
                if (r < 3) {
                    player = 'b';
                    id = `b${blackCounter++}`;
                } else if (r > 4) {
                    player = 'r';
                    id = `r${redCounter++}`;
                }

                if (player) {
                    pieces[id] = { id, player, isKing: false, history: [{ row: r, col: c }] };
                    boardState[r][c] = id;
                }
            }
        }
    }
    return { pieces, boardState };
}

/**
 * Calculates all possible moves for a single piece.
 * Jumps over real pieces are mandatory and returned exclusively if available.
 * @param {string} pieceId - The ID of the piece to move.
 * @param {object} pieces - The current state of all pieces.
 * @param {Array<Array<string|null>>} boardState - The 2D array representing the board.
 * @returns {Array<object>} A list of possible move objects.
 */
export function getPossibleMoves(pieceId, pieces, boardState) {
    const piece = pieces[pieceId];
    if (!piece) return [];

    const { row, col } = piece.history.at(-1);
    const regularMoves = [], realJumpMoves = [], ghostJumpMoves = [];

    let directions = [];
    if (piece.player === 'r') directions.push([-1, -1], [-1, 1]);
    if (piece.player === 'b') directions.push([1, -1], [1, 1]);
    if (piece.isKing) directions.push(...[[-1,-1], [-1,1], [1,-1], [1,1]]);
    // Ensure unique directions for kings
    directions = [...new Map(directions.map(item => [item.join(), item])).values()];

    for (const [dr, dc] of directions) {
        // Check for regular moves
        const endRow = row + dr, endCol = col + dc;
        if (isValidSquare(endRow, endCol) && boardState[endRow][endCol] === null) {
            regularMoves.push({ endRow, endCol, jumpedInfo: null });
        }

        // Check for jumps
        const jumpMidRow = row + dr, jumpMidCol = col + dc;
        const jumpEndRow = row + 2 * dr, jumpEndCol = col + 2 * dc;

        if (isValidSquare(jumpEndRow, jumpEndCol) && boardState[jumpEndRow][jumpEndCol] === null) {
            let jumpedOnSquare = [];
            // Check for real piece to jump
            const realJumpedId = boardState[jumpMidRow][jumpMidCol];
            if (realJumpedId && pieces[realJumpedId]?.player !== piece.player) {
                jumpedOnSquare.push({ id: realJumpedId, isGhost: false, jumpedHistoryIndex: pieces[realJumpedId].history.length - 1 });
            }
            // Check for ghosts to jump
            for (const id in pieces) {
                if (pieces[id].player !== piece.player) {
                    const historyIndex = pieces[id].history.slice(0, -1).findIndex(p => p.row === jumpMidRow && p.col === jumpMidCol);
                    if (historyIndex !== -1) {
                        jumpedOnSquare.push({ id, isGhost: true, jumpedHistoryIndex: historyIndex });
                    }
                }
            }
            if (jumpedOnSquare.length > 0) {
                const isMandatory = jumpedOnSquare.some(j => !j.isGhost);
                const move = { endRow: jumpEndRow, endCol: jumpEndCol, jumpedInfo: jumpedOnSquare };
                (isMandatory ? realJumpMoves : ghostJumpMoves).push(move);
            }
        }
    }

    // Mandatory jumps take precedence
    if (realJumpMoves.length > 0) return realJumpMoves;
    return [...ghostJumpMoves, ...regularMoves];
}


/**
 * Recursively calculates the outcome of a piece collapsing its history.
 * This is a PURE function. It does not modify state. It returns a list of events.
 * @param {string} pieceId - The piece that is collapsing.
 * @param {number} targetHistoryIndex - The history index to attempt to collapse to.
 * @param {object} pieces - The current piece states.
 * @param {Array<Array<string|null>>} boardState - The current board state.
 * @param {object|null} protectedSquare - A square that cannot be collapsed into (the landing square of the jumping piece).
 * @returns {Array<object>} A list of events describing what happened (move, capture, etc.).
 */
function calculateCollapse(pieceId, targetHistoryIndex, pieces, boardState, protectedSquare) {
    const piece = pieces[pieceId];
    let events = [];
    
    // Base Case 1: Piece does not exist (already captured in a cascade).
    if (!piece) return [];

    // Base Case 2: Piece runs out of history and is captured.
    if (targetHistoryIndex < 0) {
        events.push({ type: 'capture', pieceId, player: piece.player, reason: 'Ran out of history' });
        return events;
    }
    
    const targetPos = piece.history[targetHistoryIndex];

    // Base Case 3: Interference. Collapse would land on the protected square. Try older state.
    if (protectedSquare && targetPos.row === protectedSquare.row && targetPos.col === protectedSquare.col) {
        events.push({ type: 'interference', pieceId });
        return events.concat(calculateCollapse(pieceId, targetHistoryIndex - 1, pieces, boardState, protectedSquare));
    }
    
    const occupyingId = boardState[targetPos.row][targetPos.col];

    // Case 4: Cascade. Target square is occupied by another piece.
    if (occupyingId && occupyingId !== pieceId) {
        events.push({ type: 'cascade_start', triggerId: pieceId, targetId: occupyingId });

        // The occupying piece must collapse first.
        const cascadeEvents = calculateCollapse(occupyingId, pieces[occupyingId].history.length - 2, pieces, boardState, protectedSquare);
        events.push(...cascadeEvents);

        // Simulate the board state after the cascade to see if the spot is now free.
        let tempBoardState = boardState.map(r => [...r]);
        for (const event of cascadeEvents) {
            if (event.type === 'collapse_move') {
                const { fromPos, toPos: cascadeToPos, pieceId: movedPieceId } = event;
                tempBoardState[fromPos.row][fromPos.col] = null;
                tempBoardState[cascadeToPos.row][cascadeToPos.col] = movedPieceId;
            } else if (event.type === 'capture') {
                 const capturedPiece = pieces[event.pieceId];
                 const lastPos = capturedPiece.history.at(-1);
                 tempBoardState[lastPos.row][lastPos.col] = null;
            }
        }
        
        // If the spot is STILL occupied after cascade, the original piece must try an older state.
        if (tempBoardState[targetPos.row][targetPos.col]) {
            return events.concat(calculateCollapse(pieceId, targetHistoryIndex - 1, pieces, boardState, protectedSquare));
        } else {
            // Spot is now free. The original piece can successfully collapse.
            const fromPos = piece.history.at(-1);
            events.push({ type: 'collapse_move', pieceId, fromPos, toPos: targetPos, newHistoryIndex: targetHistoryIndex });
        }

    } else { // Case 5: Simple collapse to an empty square.
        const fromPos = piece.history.at(-1);
        events.push({ type: 'collapse_move', pieceId, fromPos, toPos: targetPos, newHistoryIndex: targetHistoryIndex });
    }

    return events;
}

/**
 * Applies a given move to the game state and returns the new state and all resulting events.
 * This is the main exported function for processing a move.
 * @param {object} gameState - The entire current game state.
 * @param {string} pieceId - The ID of the piece being moved.
 * @param {object} move - The move object from getPossibleMoves.
 * @returns {{newState: object, events: Array<object>}}
 */
export function applyMove(gameState, pieceId, move) {
    logger.info('Apply Move', `Applying move for piece ${pieceId} to (${move.endRow}, ${move.endCol})`);
    // Deep copy to ensure the original state is not mutated (immutability).
    let { pieces, boardState } = JSON.parse(JSON.stringify(gameState)); 
    const piece = pieces[pieceId];
    const { endRow, endCol, jumpedInfo } = move;
    const fromPos = piece.history.at(-1);
    let events = [];

    // 1. Piece Movement Event
    events.push({ type: 'move', pieceId, fromPos, toPos: { row: endRow, col: endCol }});
    if (!jumpedInfo) {
        events.push({ type: 'ghost', pieceId, player: piece.player, pos: fromPos, historyIndex: piece.history.length - 1 });
    }
    
    // 2. Update state for the primary move
    boardState[fromPos.row][fromPos.col] = null;
    boardState[endRow][endCol] = pieceId;
    piece.history.push({ row: endRow, col: endCol });

    // 3. Kinging Event
    const becameKing = !piece.isKing && ((piece.player === 'r' && endRow === 0) || (piece.player === 'b' && endRow === 7));
    if (becameKing) {
        piece.isKing = true;
        events.push({ type: 'king', pieceId });
    }
    
    // 4. Observation and Collapse Events
    if (jumpedInfo && jumpedInfo.length > 0) {
        const protectedSquare = { row: endRow, col: endCol };

        for (const jump of jumpedInfo) {
            events.push({ type: 'observation', jumpedId: jump.id, isGhost: jump.isGhost });
            const collapseEvents = calculateCollapse(jump.id, jump.jumpedHistoryIndex - 1, pieces, boardState, protectedSquare);
            
            // Apply the results of the collapse to our temporary state so subsequent collapses are accurate
            for (const event of collapseEvents) {
                if (event.type === 'collapse_move') {
                    const collapsingPiece = pieces[event.pieceId];
                    boardState[event.fromPos.row][event.fromPos.col] = null;
                    boardState[event.toPos.row][event.toPos.col] = event.pieceId;
                    // *** RULE CHANGE: A collapsed piece loses all its ghosts. ***
                    // Its history is reset to only its new, current position.
                    collapsingPiece.history = [event.toPos];
                } else if (event.type === 'capture') {
                    const capturedPiece = pieces[event.pieceId];
                    if (capturedPiece) {
                        const lastPos = capturedPiece.history.at(-1);
                        if (boardState[lastPos.row][lastPos.col] === event.pieceId) {
                            boardState[lastPos.row][lastPos.col] = null;
                        }
                        delete pieces[event.pieceId];
                    }
                }
            }
            events.push(...collapseEvents);
        }
    
    
    // 5. Multi-Jump Event
    const furtherJumps = getPossibleMoves(pieceId, pieces, boardState).filter(m => m.jumpedInfo);
    if (furtherJumps.length > 0) {
        const hasMandatory = furtherJumps.some(m => m.jumpedInfo.some(j => !j.isGhost));
        events.push({ type: 'multijump', pieceId, hasMandatory });
    }
}
    return { newState: { pieces, boardState }, events };
}

/**
 * Checks for a win condition.
 * @param {object} pieces - The current state of all pieces.
 * @param {string} nextTurn - The player whose turn is next.
 * @param {Array<Array<string|null>>} boardState - The current board state.
 * @returns {string|null} 'r' or 'b' if a player has won, otherwise null.
 */
export function checkWinCondition(pieces, nextTurn, boardState) {
    const redPieces = Object.values(pieces).filter(p => p.player === 'r');
    const blackPieces = Object.values(pieces).filter(p => p.player === 'b');

    if (redPieces.length === 0) return 'b';
    if (blackPieces.length === 0) return 'r';
    
    const currentPlayerPieces = (nextTurn === 'r') ? redPieces : blackPieces;
    const hasMoves = currentPlayerPieces.some(p => getPossibleMoves(p.id, pieces, boardState).length > 0);

    if (!hasMoves) return nextTurn === 'r' ? 'b' : 'r'; // The player with no moves loses.
    
    return null;
}

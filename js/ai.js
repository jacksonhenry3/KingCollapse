// js/ai.js
// Contains the logic for the AI opponent.

import * as logic from './gameLogic.js';

/**
 * A simple AI to select a move.
 * The strategy is:
 * 1. Prioritize mandatory jumps (real pieces).
 * 2. Prioritize optional jumps (ghosts).
 * 3. Finally, consider regular moves.
 * 4. Within each category, pick a move at random.
 *
 * @param {object} pieces - The current state of all pieces.
 * @param {Array<Array<string|null>>} boardState - The 2D array representing the board.
 * @param {string} aiPlayer - The player the AI is controlling ('r' or 'b').
 * @returns {object|null} The best move object found, or null if no moves are available.
 */
export function getAIMove(pieces, boardState, aiPlayer) {
    const myPieces = Object.values(pieces).filter(p => p.player === aiPlayer);
    
    let allPossibleMoves = [];
    // Iterate through all of the AI's pieces to find every possible move.
    for (const piece of myPieces) {
        const movesForPiece = logic.getPossibleMoves(piece.id, pieces, boardState);
        // Add the pieceId to each move so we know which piece is moving.
        allPossibleMoves.push(...movesForPiece.map(move => ({ ...move, pieceId: piece.id })));
    }

    if (allPossibleMoves.length === 0) {
        return null; // No moves available.
    }

    // Priority 1: Mandatory Jumps
    const mandatoryJumps = allPossibleMoves.filter(m => m.jumpedInfo && !m.jumpedInfo.isGhost);
    if (mandatoryJumps.length > 0) {
        // Pick a random mandatory jump.
        return mandatoryJumps[Math.floor(Math.random() * mandatoryJumps.length)];
    }

    // Priority 2: Ghost Jumps
    const ghostJumps = allPossibleMoves.filter(m => m.jumpedInfo && m.jumpedInfo.isGhost);
    if (ghostJumps.length > 0) {
        // Pick a random ghost jump.
        return ghostJumps[Math.floor(Math.random() * ghostJumps.length)];
    }
    
    // Priority 3: Regular Moves
    const regularMoves = allPossibleMoves.filter(m => !m.jumpedInfo);
    if (regularMoves.length > 0) {
        return regularMoves[Math.floor(Math.random() * regularMoves.length)];
    }

    // Fallback in case there are moves but they don't fit a category (shouldn't happen).
    return allPossibleMoves.length > 0 ? allPossibleMoves[0] : null;
}

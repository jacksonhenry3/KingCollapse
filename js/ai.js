// js/ai.js
// Contains the logic for the AI opponent.

import * as logic from './gameLogic.js';

/**
 * A simple AI to select a move. The strategy is to prioritize jumps and then pick randomly.
 * @param {object} gameState - The entire current game state { pieces, boardState, turn, ... }.
 * @param {string|null} mustMovePieceId - If in a multi-jump, the ID of the piece that must move.
 * @returns {object|null} The best move object found, or null if no moves are available.
 */
export function getAIMove(gameState, mustMovePieceId = null) {
    const { pieces, boardState, turn } = gameState;

    // If the AI must move a specific piece (multi-jump), only consider that piece.
    // Otherwise, consider all of the AI's pieces.
    const piecesToConsider = mustMovePieceId
        ? (pieces[mustMovePieceId] ? [pieces[mustMovePieceId]] : [])
        : Object.values(pieces).filter(p => p && p.player === turn);

    let allPossibleMoves = [];
    for (const piece of piecesToConsider) {
        if (!piece) continue;
        const movesForPiece = logic.getPossibleMoves(piece.id, pieces, boardState);
        allPossibleMoves.push(...movesForPiece.map(move => ({ ...move, pieceId: piece.id })));
    }

    if (allPossibleMoves.length === 0) {
        return null;
    }

    // Priority 1: Mandatory Jumps (over real pieces)
    const mandatoryJumps = allPossibleMoves.filter(m => m.jumpedInfo && m.jumpedInfo.some(j => !j.isGhost));
    if (mandatoryJumps.length > 0) {
        return mandatoryJumps[Math.floor(Math.random() * mandatoryJumps.length)];
    }

    // If in a multi-jump scenario, the AI *must* jump. If only ghost jumps are available, it must take one.
    // If not in a multi-jump, ghost jumps are optional.
    const ghostJumps = allPossibleMoves.filter(m => m.jumpedInfo);
    if (mustMovePieceId && ghostJumps.length > 0) {
        return ghostJumps[Math.floor(Math.random() * ghostJumps.length)];
    }

    // Priority 2: Optional Ghost Jumps vs Regular Moves (50/50 chance to take a ghost jump if available)
    const regularMoves = allPossibleMoves.filter(m => !m.jumpedInfo);
    if (ghostJumps.length > 0 && Math.random() > 0.5) {
         return ghostJumps[Math.floor(Math.random() * ghostJumps.length)];
    }
    
    // Priority 3: Regular Moves
    if (regularMoves.length > 0) {
        return regularMoves[Math.floor(Math.random() * regularMoves.length)];
    }
    
    // Fallback: If only ghost jumps remain and the AI decided not to take one, it must take one now.
    if (ghostJumps.length > 0) {
        return ghostJumps[Math.floor(Math.random() * ghostJumps.length)];
    }

    return null; // No moves possible
}

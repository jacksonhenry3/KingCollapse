// js/gameLogic.js
// Core rules and state manipulation for King Collapse.

function isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function initGame() {
    const pieces = {};
    const boardState = Array(8).fill(null).map(() => Array(8).fill(null));
    let redCounter = 1, blackCounter = 1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) {
                let p = null, id = null;
                if (r < 3) { p = 'b'; id = `b${blackCounter++}`; } 
                else if (r > 4) { p = 'r'; id = `r${redCounter++}`; }
                if (p) {
                    pieces[id] = { id, player: p, isKing: false, history: [{ row: r, col: c }] };
                    boardState[r][c] = id;
                }
            }
        }
    }
    return { pieces, boardState };
}

// **REWRITE**: This function now recursively builds a list of animations to execute in order.
export async function triggerCollapse(pieceId, targetHistoryIndex, pieces, boardState, ui, logger, protectedSquare) {
    let animationChanges = [];
    logger.group(`COLLAPSE: Piece ${pieceId}`);
    const piece = pieces[pieceId];

    if (!piece) {
        logger.error('Collapse', `Piece ${pieceId} not found.`);
        logger.groupEnd();
        return [];
    }

    // Base Case: Piece runs out of history and is captured.
    if (targetHistoryIndex < 0) {
        ui.showMessage(`Collapse failed! Piece ${pieceId} is captured.`);
        logger.error('Capture', `Piece ${pieceId} ran out of history and is captured.`);
        animationChanges.push({ type: 'remove', pieceId: piece.id, player: piece.player });
        const currentPos = piece.history.at(-1);
        if (boardState[currentPos.row][currentPos.col] === pieceId) {
            boardState[currentPos.row][currentPos.col] = null;
        }
        delete pieces[pieceId];
        logger.groupEnd();
        return animationChanges;
    }

    const currentPos = piece.history.at(-1);
    const targetPos = piece.history[targetHistoryIndex];
    logger.info('Collapse', `Piece ${pieceId} trying collapse to state #${targetHistoryIndex} at [${targetPos.row},${targetPos.col}].`);

    // Base Case: Interference with the jumping piece's landing square.
    if (protectedSquare && targetPos.row === protectedSquare.row && targetPos.col === protectedSquare.col) {
        ui.showMessage(`Interference! Piece ${pieceId} is captured.`);
        logger.error('Capture', `Piece ${pieceId} tried to collapse into protected square and is captured.`);
        animationChanges.push({ type: 'remove', pieceId: piece.id, player: piece.player });
        if (boardState[currentPos.row][currentPos.col] === pieceId) {
            boardState[currentPos.row][currentPos.col] = null;
        }
        delete pieces[pieceId];
        logger.groupEnd();
        return animationChanges;
    }

    const occupyingId = boardState[targetPos.row][targetPos.col];
    // Recursive Step: The target square is occupied, triggering a cascade.
    if (occupyingId && occupyingId !== pieceId) {
        logger.warn('Cascade', `Target [${targetPos.row},${targetPos.col}] occupied by ${occupyingId}. It must collapse first.`);
        const cascadeChanges = await triggerCollapse(occupyingId, pieces[occupyingId].history.length - 2, pieces, boardState, ui, logger, protectedSquare);
        animationChanges.push(...cascadeChanges);
        
        // After the cascade, check if the square is *still* occupied.
        if (boardState[targetPos.row][targetPos.col]) {
            logger.warn('Collapse', `Target still occupied. ${pieceId} must try its next previous state.`);
            const selfCascadeChanges = await triggerCollapse(pieceId, targetHistoryIndex - 1, pieces, boardState, ui, logger, protectedSquare);
            animationChanges.push(...selfCascadeChanges);
        } else {
            // The cascade was successful, the square is now free.
            logger.info('Collapse', `Cascade successful. Target [${targetPos.row},${targetPos.col}] is now free for ${pieceId}.`);
            boardState[currentPos.row][currentPos.col] = null;
            boardState[targetPos.row][targetPos.col] = pieceId;
            piece.history = piece.history.slice(0, targetHistoryIndex + 1);
            animationChanges.push({ type: 'move', pieceId: piece.id, toRow: targetPos.row, toCol: targetPos.col });
        }
    } else {
        // Base Case: The target square is free, collapse successfully.
        logger.info('Collapse', `Target [${targetPos.row},${targetPos.col}] is free. Moving piece ${pieceId}.`);
        if (boardState[currentPos.row][currentPos.col] === pieceId) {
            boardState[currentPos.row][currentPos.col] = null;
        }
        boardState[targetPos.row][targetPos.col] = pieceId;
        piece.history = piece.history.slice(0, targetHistoryIndex + 1);
        animationChanges.push({ type: 'move', pieceId: piece.id, toRow: targetPos.row, toCol: targetPos.col });
    }
    logger.groupEnd();
    return animationChanges;
}

export function getPossibleMoves(pieceId, pieces, boardState) {
    const piece = pieces[pieceId];
    if (!piece) return [];
    
    const { row, col } = piece.history.at(-1);
    const regularMoves = [], realJumpMoves = [], ghostJumpMoves = [];
    const directions = [];

    if (piece.player === 'r') directions.push([-1, -1], [-1, 1]);
    else if (piece.player === 'b') directions.push([1, -1], [1, 1]);
    if (piece.isKing) directions.push(...[[-1,-1], [-1,1], [1,-1], [1,1]].filter(d => !directions.some(d2 => d2[0] === d[0] && d2[1] === d[1])));

    for (const [dr, dc] of directions) {
        const jumpMidRow = row + dr, jumpMidCol = col + dc;
        const jumpEndRow = row + 2 * dr, jumpEndCol = col + 2 * dc;

        if (isValidSquare(jumpEndRow, jumpEndCol) && boardState[jumpEndRow][jumpEndCol] === null) {
            let jumpedOnSquare = [];
            const realJumpedId = boardState[jumpMidRow][jumpMidCol];
            if (realJumpedId && pieces[realJumpedId]?.player !== piece.player) {
                jumpedOnSquare.push({ id: realJumpedId, isGhost: false, jumpedHistoryIndex: pieces[realJumpedId].history.length - 1 });
            }
            for (const id in pieces) {
                if (pieces[id].player !== piece.player) {
                    const historyIndex = pieces[id].history.findIndex(p => p.row === jumpMidRow && p.col === jumpMidCol);
                    if (historyIndex !== -1 && historyIndex < pieces[id].history.length - 1) {
                        jumpedOnSquare.push({ id, isGhost: true, jumpedHistoryIndex: historyIndex });
                    }
                }
            }

            if (jumpedOnSquare.length > 0) {
                const isMandatory = jumpedOnSquare.some(j => !j.isGhost);
                const move = { endRow: jumpEndRow, endCol: jumpEndCol, jumpedInfo: jumpedOnSquare };
                if (isMandatory) {
                    realJumpMoves.push(move);
                } else {
                    ghostJumpMoves.push(move);
                }
            }
        }
        
        const endRow = row + dr, endCol = col + dc;
        if (isValidSquare(endRow, endCol) && boardState[endRow][endCol] === null) {
            regularMoves.push({ endRow, endCol, jumpedInfo: null });
        }
    }

    if (realJumpMoves.length > 0) {
        return realJumpMoves;
    }
    return [...ghostJumpMoves, ...regularMoves];
}

export function checkWinCondition(pieces, turn, boardState) {
    const redPieces = Object.values(pieces).filter(p => p.player === 'r');
    const blackPieces = Object.values(pieces).filter(p => p.player === 'b');

    if (redPieces.length === 0) return 'b';
    if (blackPieces.length === 0) return 'r';
    
    const currentPlayerPieces = (turn === 'r') ? redPieces : blackPieces;
    const hasMoves = currentPlayerPieces.some(p => getPossibleMoves(p.id, pieces, boardState).length > 0);

    if (!hasMoves) return turn === 'r' ? 'b' : 'r';
    
    return null;
}

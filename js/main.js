// js/main.js
// Main game logic, event handling, and state management.

import logger from './logger.js';
import * as logic from './gameLogic.js';
import { initUI } from './ui.js';
import { getAIMove } from './ai.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Game State Variables ---
    let pieces, boardState, turn;
    let selectedPieceId = null;
    let isMultiJump = false;
    let isAnimating = false;
    let gameMode = null;
    let gameHistory = [];
    let redCaptured = [];
    let blackCaptured = [];
    const aiPlayer = 'b';
    
    const ui = initUI();

    // --- Game Flow & Event Handlers ---

    async function handleSquareClick(e) {
        if (isAnimating || !gameMode || (gameMode === 'ai' && turn === aiPlayer)) {
            return;
        }

        const square = e.currentTarget;
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);
        
        if (selectedPieceId) {
            const pieceIdOnSquare = boardState[row][col];

            // **NEW**: Allows the player to pass their turn if only optional ghost jumps are available.
            if (isMultiJump && selectedPieceId === pieceIdOnSquare) {
                const furtherJumps = logic.getPossibleMoves(selectedPieceId, pieces, boardState).filter(m => m.jumpedInfo);
                const hasMandatoryFurtherJump = furtherJumps.some(m => m.jumpedInfo.some(j => !j.isGhost));
                if (!hasMandatoryFurtherJump) {
                    logger.info('Multi-Jump', 'Player passed on optional jump.');
                    selectedPieceId = null;
                    isMultiJump = false;
                    switchTurn();
                    ui.clearHighlights();
                    return;
                }
            }

            const possibleMoves = logic.getPossibleMoves(selectedPieceId, pieces, boardState);
            const targetMove = possibleMoves.find(move => move.endRow === row && move.endCol === col);

            if (targetMove) {
                gameHistory.push({
                    pieces: JSON.parse(JSON.stringify(pieces)),
                    boardState: JSON.parse(JSON.stringify(boardState)),
                    turn: turn,
                    redCaptured: [...redCaptured],
                    blackCaptured: [...blackCaptured]
                });
                await movePiece(selectedPieceId, targetMove);
            } else { 
                if (isMultiJump) {
                    ui.showMessage("You must complete the mandatory jump.");
                    return;
                }
                ui.clearHighlights();
                selectedPieceId = null;
            }
        } else {
            const pieceIdOnSquare = boardState[row][col];
            if (pieceIdOnSquare && pieces[pieceIdOnSquare].player === turn) {
                selectedPieceId = pieceIdOnSquare;
                ui.highlightPieceAndMoves(selectedPieceId, pieces, boardState);
            }
        }
    }
    
    async function movePiece(pieceId, move) {
        isAnimating = true;
        logger.group(`MOVE: Piece ${pieceId}`);
        ui.clearHighlights();
        
        const piece = pieces[pieceId];
        const { row: fromRow, col: fromCol } = piece.history.at(-1);
        const { endRow, endCol, jumpedInfo } = move;

        if (!jumpedInfo) {
            const ghostIndex = piece.history.length - 1;
            ui.addGhost(piece, ghostIndex);
        }

        await ui.animatePieceMove(pieceId, endRow, endCol);

        boardState[fromRow][fromCol] = null;
        boardState[endRow][endCol] = pieceId;
        piece.history.push({ row: endRow, col: endCol });

        if ((piece.player === 'r' && endRow === 0) || (piece.player === 'b' && endRow === 7)) {
            if (!piece.isKing) {
                piece.isKing = true;
                logger.info('King', `Piece ${pieceId} has been crowned!`);
                ui.renderPieces(pieces, redCaptured, blackCaptured);
            }
        }

        if (jumpedInfo && jumpedInfo.length > 0) {
            const protectedSquare = { row: endRow, col: endCol };
            let allChanges = [];

            for (const jump of jumpedInfo) {
                const type = jump.isGhost ? "ghost" : "real piece";
                ui.showMessage(`Observation! A ${type} of piece ${jump.id} was jumped.`);
                logger.warn('Observation', `A ${type} of piece ${jump.id} jumped. Triggering collapse.`);
                const changes = await logic.triggerCollapse(jump.id, jump.jumpedHistoryIndex - 1, pieces, boardState, ui, logger, protectedSquare);
                allChanges.push(...changes);
            }
            
            if (allChanges.length > 0) {
                for (const change of allChanges) {
                    if (change.type === 'move') {
                        await ui.animatePieceMove(change.pieceId, change.toRow, change.toCol);
                    } else if (change.type === 'remove') {
                        if (change.player === 'r') redCaptured.push(change.pieceId);
                        else blackCaptured.push(change.pieceId);
                        await ui.animatePieceRemoval(change.pieceId);
                    }
                }
            }
            ui.renderPieces(pieces, redCaptured, blackCaptured);

            const furtherJumps = logic.getPossibleMoves(pieceId, pieces, boardState).filter(m => m.jumpedInfo);
            
            // **FIX**: Enter multi-jump state if ANY further jump is available.
            if (furtherJumps.length > 0) {
                const hasMandatoryFurtherJump = furtherJumps.some(m => m.jumpedInfo.some(j => !j.isGhost));
                
                isMultiJump = true;
                selectedPieceId = pieceId;
                logger.info('Multi-Jump', `Further jumps available for ${pieceId}.`);
                ui.highlightPieceAndMoves(pieceId, pieces, boardState);
                
                if (hasMandatoryFurtherJump) {
                    ui.updateStatus("Complete the mandatory jump!", turn);
                } else {
                    ui.updateStatus("Optional jump available. Click piece to pass.", turn);
                }

                logger.groupEnd();
                isAnimating = false;
                if (gameMode === 'ai' && turn === aiPlayer) {
                    setTimeout(makeAIMove, 500);
                }
                return;
            }
        }
        
        selectedPieceId = null;
        isMultiJump = false;
        switchTurn();
        
        const winner = logic.checkWinCondition(pieces, turn, boardState);
        if (winner) {
            ui.endGame(winner, gameMode);
        }
        logger.groupEnd();
        isAnimating = false;
    }

    function switchTurn() {
        turn = (turn === 'r') ? 'b' : 'r';
        logger.info('Turn Switch', `It is now ${turn === 'r' ? 'Red' : 'Black'}'s turn.`);
        ui.updateStatus(null, turn);

        if (gameMode === 'ai' && turn === aiPlayer && !isMultiJump) {
            setTimeout(makeAIMove, 500);
        }
    }

    async function makeAIMove() {
        if (isAnimating) return;
        isAnimating = true;
        logger.group("AI TURN");

        const aiMove = getAIMove(pieces, boardState, aiPlayer, isMultiJump ? selectedPieceId : null);
        
        if (aiMove) {
            logger.info('AI', `AI chose to move piece ${aiMove.pieceId}.`);
            ui.highlightPieceAndMoves(aiMove.pieceId, pieces, boardState);

            await new Promise(resolve => setTimeout(resolve, 750));
            
            gameHistory.push({
                pieces: JSON.parse(JSON.stringify(pieces)),
                boardState: JSON.parse(JSON.stringify(boardState)),
                turn: turn,
                redCaptured: [...redCaptured],
                blackCaptured: [...blackCaptured]
            });
            await movePiece(aiMove.pieceId, aiMove);

        } else {
            // **FIX**: If the AI has no mandatory moves in a multi-jump, it should pass its turn.
            if (isMultiJump) {
                logger.info('AI', 'AI passed on optional jump.');
                selectedPieceId = null;
                isMultiJump = false;
                switchTurn();
            } else {
                logger.warn('AI', 'AI has no moves available.');
            }
            isAnimating = false;
        }
        logger.groupEnd();
    }

    function startGame() {
        logger.group("NEW GAME");
        const initialState = logic.initGame();
        pieces = initialState.pieces;
        boardState = initialState.boardState;
        turn = 'r';
        selectedPieceId = null;
        isMultiJump = false;
        isAnimating = false;
        gameHistory = [];
        redCaptured = [];
        blackCaptured = [];
        
        ui.renderBoard(handleSquareClick);
        ui.renderPieces(pieces, redCaptured, blackCaptured);
        ui.updateStatus(null, turn);
        logger.info('Game Start', `Board initialized. Mode: ${gameMode}. Red player starts.`);
        logger.groupEnd();
    }
    
    function initiateGame(mode) {
        gameMode = mode;
        ui.hideGameModeModal();
        startGame();
    }

    async function handleUndo() {
        if (isAnimating) return;
        logger.group("UNDO");
        if (!gameMode) return;
        if (isMultiJump) {
            ui.showMessage("Cannot undo during a multi-jump sequence.");
            return;
        }
        const undoCount = (gameMode === 'ai' && turn === 'r' && gameHistory.length >= 2) ? 2 : 1;
        if (gameHistory.length < undoCount) {
            ui.showMessage("No more moves to undo.");
            return;
        }
        
        isAnimating = true;
        ui.clearHighlights();
        
        const currentState = { 
            pieces: JSON.parse(JSON.stringify(pieces)),
        };
        let lastState;
        for (let i = 0; i < undoCount; i++) {
            lastState = gameHistory.pop();
        }

        const animationPromises = [];
        const allPieceIds = new Set([...Object.keys(currentState.pieces), ...Object.keys(lastState.pieces)]);

        for (const pieceId of allPieceIds) {
            const inCurrent = currentState.pieces[pieceId];
            const inLast = lastState.pieces[pieceId];

            if (inCurrent && !inLast) {
                animationPromises.push(ui.animatePieceRemoval(pieceId));
            } else if (!inCurrent && inLast) {
                const newPieceElement = ui.addPieceToBoard(inLast);
                newPieceElement.style.opacity = '0';
                animationPromises.push(new Promise(res => setTimeout(res, 20)).then(() => {
                    newPieceElement.style.opacity = '1';
                    const pos = inLast.history.at(-1);
                    return ui.animatePieceMove(pieceId, pos.row, pos.col, true);
                }));
            } else if (inCurrent && inLast) {
                const currentPos = inCurrent.history.at(-1);
                const lastPos = inLast.history.at(-1);
                if (currentPos.row !== lastPos.row || currentPos.col !== lastPos.col) {
                    animationPromises.push(ui.animatePieceMove(pieceId, lastPos.row, lastPos.col, true));
                }
            }
        }

        await Promise.all(animationPromises);

        pieces = lastState.pieces;
        boardState = lastState.boardState;
        turn = lastState.turn;
        redCaptured = lastState.redCaptured;
        blackCaptured = lastState.blackCaptured;
        selectedPieceId = null;
        isMultiJump = false;
        
        ui.renderPieces(pieces, redCaptured, blackCaptured);
        ui.updateStatus(null, turn);
        
        logger.info('Undo', 'Reverted to previous game state.');
        logger.groupEnd();
        isAnimating = false;
    }

    window.addEventListener('modeSelect', (e) => initiateGame(e.detail));
    window.addEventListener('gamereset', () => {
        if (gameMode) initiateGame(gameMode);
    });
    window.addEventListener('gameundo', handleUndo);
});

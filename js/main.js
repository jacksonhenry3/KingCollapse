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

        if (jumpedInfo) {
            const type = jumpedInfo.isGhost ? "ghost" : "real piece";
            ui.showMessage(`Observation! A ${type} of piece ${jumpedInfo.id} was jumped.`);
            logger.warn('Observation', `A ${type} of piece ${jumpedInfo.id} jumped. Triggering collapse.`);
            
            const protectedSquare = { row: endRow, col: endCol };
            const changes = await logic.triggerCollapse(jumpedInfo.id, jumpedInfo.jumpedHistoryIndex - 1, pieces, boardState, ui, logger, protectedSquare);
            
            if (changes) {
                for (const change of changes) {
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
            const hasMandatoryFurtherJump = furtherJumps.some(m => !m.jumpedInfo.isGhost);

            if (hasMandatoryFurtherJump) {
                isMultiJump = true;
                selectedPieceId = pieceId;
                logger.info('Multi-Jump', `A mandatory jump is available for ${pieceId}.`);
                ui.highlightPieceAndMoves(pieceId, pieces, boardState);
                ui.updateStatus("Complete the multi-jump!", turn);
                logger.groupEnd();
                isAnimating = false;
                if (gameMode === 'ai' && turn === aiPlayer) {
                    setTimeout(makeAIMove, 500);
                }
                return;
            }
        } else {
            // **FIX**: For a simple move, just add the new ghost instead of a full redraw.
            const ghostIndex = piece.history.length - 2;
            ui.addGhost(piece, ghostIndex);
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

        const aiMove = getAIMove(pieces, boardState, aiPlayer);
        
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
            logger.warn('AI', 'AI has no moves available.');
        }
        logger.groupEnd();
        isAnimating = false;
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

    function handleUndo() {
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
        
        let lastState;
        for (let i = 0; i < undoCount; i++) {
            lastState = gameHistory.pop();
        }

        pieces = lastState.pieces;
        boardState = lastState.boardState;
        turn = lastState.turn;
        redCaptured = lastState.redCaptured;
        blackCaptured = lastState.blackCaptured;
        selectedPieceId = null;
        isMultiJump = false;
        
        ui.renderPieces(pieces, redCaptured, blackCaptured);
        ui.updateStatus(null, turn);
        ui.clearHighlights();
        logger.info('Undo', 'Reverted to previous game state.');
        logger.groupEnd();
    }

    window.addEventListener('modeSelect', (e) => initiateGame(e.detail));
    window.addEventListener('gamereset', () => {
        if (gameMode) initiateGame(gameMode);
    });
    window.addEventListener('gameundo', handleUndo);
});

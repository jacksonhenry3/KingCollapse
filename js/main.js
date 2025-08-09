// js/main.js
// Main game controller. Manages state, handles user input, and orchestrates the game flow.

import logger from './logger.js';
import * as logic from './gameLogic.js';
import { initUI } from './ui.js';
import { getAIMove } from './ai.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    let appState = 'menu'; // 'menu' or 'game'

    // --- Game State ---
    let gameState = {};
    let gameHistory = [];
    
    // --- UI/Controller State ---
    let uiState = {};
    const AI_PLAYER = 'b';

    // Initialize UI and provide callbacks for user actions
    const ui = initUI({ onSquareClick: handleSquareClick });

    /**
     * Resets all state variables to their initial values.
     */
    function resetAllState() {
        gameState = {
            pieces: {},
            boardState: [],
            turn: 'r',
            redCaptured: [],
            blackCaptured: [],
        };
        gameHistory = [];
        uiState = {
            selectedPieceId: null,
            isAnimating: false,
            isMultiJump: false,
            gameMode: null, 
            gameOver: false,
        };
    }

    // --- Core Application Flow ---

    /**
     * Switches to the main menu view and resets state.
     */
    function returnToMainMenu() {
        logger.info('System', 'Returning to main menu.');
        appState = 'menu';
        resetAllState();
        ui.showView('menu');
    }

    /**
     * Sets up and starts a new game, switching to the game view.
     * @param {string} mode - The selected game mode ('human' or 'ai').
     */
    function startGame(mode) {
        logger.group("NEW GAME");
        appState = 'game';
        resetAllState(); 
        ui.showView('game');

        uiState.gameMode = mode;
        document.getElementById('board').style.pointerEvents = 'auto';

        const { pieces, boardState } = logic.createInitialState();
        gameState.pieces = pieces;
        gameState.boardState = boardState;
        
        resetSelection();

        ui.renderBoard();
        ui.renderFullState(gameState.pieces, gameState.redCaptured, gameState.blackCaptured, true);
        updateStatusMessage();
        logger.info('Game Start', `Mode: ${uiState.gameMode}. Red player starts.`);
        logger.groupEnd();
    }

    // --- Game Logic Handling ---

    async function handleSquareClick(e) {
        if (uiState.isAnimating || uiState.gameOver || (uiState.gameMode === 'ai' && gameState.turn === AI_PLAYER)) {
            return;
        }
        // ... (rest of the function is unchanged)
        const square = e.currentTarget;
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);

        if (uiState.selectedPieceId) {
            const possibleMoves = logic.getPossibleMoves(uiState.selectedPieceId, gameState.pieces, gameState.boardState);
            const targetMove = possibleMoves.find(move => move.endRow === row && move.endCol === col);

            if (targetMove) {
                await processMove(uiState.selectedPieceId, targetMove);
            } else if (uiState.isMultiJump) {
                const pieceIdOnSquare = gameState.boardState[row][col];
                const furtherJumps = logic.getPossibleMoves(uiState.selectedPieceId, gameState.pieces, gameState.boardState).filter(m => m.jumpedInfo);
                const hasMandatoryFurtherJump = furtherJumps.some(m => m.jumpedInfo.some(j => !j.isGhost));

                if (pieceIdOnSquare === uiState.selectedPieceId && !hasMandatoryFurtherJump) {
                    logger.info('Multi-Jump', 'Player passed on optional jump.');
                    endTurn();
                } else {
                    ui.showMessage("You must complete the mandatory jump.");
                }
            } else {
                resetSelection();
            }
        } else {
            const pieceId = gameState.boardState[row][col];
            if (pieceId && gameState.pieces[pieceId]?.player === gameState.turn) {
                selectPiece(pieceId);
            }
        }
    }

    async function processMove(pieceId, move) {
        if (uiState.isAnimating) return;
        uiState.isAnimating = true;
        logger.group(`PROCESS MOVE: Piece ${pieceId}`);

        gameHistory.push(JSON.parse(JSON.stringify(gameState)));
        resetSelection();

        const { newState, events } = logic.applyMove(gameState, pieceId, move);
        
        const newRedCaptured = [...gameState.redCaptured];
        const newBlackCaptured = [...gameState.blackCaptured];
        events.forEach(event => {
            if (event.type === 'capture') {
                (event.player === 'r' ? newRedCaptured : newBlackCaptured).push(event.pieceId);
            }
        });

        gameState = {
            ...gameState,
            pieces: newState.pieces,
            boardState: newState.boardState,
            redCaptured: newRedCaptured,
            blackCaptured: newBlackCaptured
        };

        await animateEvents(events);
        ui.renderFullState(gameState.pieces, gameState.redCaptured, gameState.blackCaptured);
        
        const lastEvent = events.at(-1);
        if (lastEvent?.type === 'multijump') {
            logger.info('Multi-Jump', `Further jumps available for ${lastEvent.pieceId}.`);
            uiState.isMultiJump = true;
            selectPiece(lastEvent.pieceId);
            updateStatusMessage();
            uiState.isAnimating = false;
            if (uiState.gameMode === 'ai' && gameState.turn === AI_PLAYER) {
                setTimeout(makeAIMove, 500);
            }
        } else {
            endTurn();
        }
        
        logger.groupEnd();
    }

    function endTurn() {
        gameState.turn = (gameState.turn === 'r' ? 'b' : 'r');
        resetSelection();

        const winner = logic.checkWinCondition(gameState.pieces, gameState.turn, gameState.boardState);
        if (winner) {
            handleGameOver(winner);
        } else {
            updateStatusMessage();
            uiState.isAnimating = false;
            if (uiState.gameMode === 'ai' && gameState.turn === AI_PLAYER) {
                setTimeout(makeAIMove, 500);
            }
        }
    }

    async function makeAIMove() {
        if (uiState.isAnimating || uiState.gameOver) return;
        logger.group("AI TURN");

        const mustMoveId = uiState.isMultiJump ? uiState.selectedPieceId : null;
        const aiMove = getAIMove(gameState, mustMoveId);

        if (aiMove) {
            logger.info('AI', `Chose to move piece ${aiMove.pieceId}.`);
            selectPiece(aiMove.pieceId);
            await processMove(aiMove.pieceId, aiMove);
            logger.info('AI', 'Move processed.');
        } else {
            logger.warn('AI', 'No moves available or chose to pass.');
            endTurn();
        }
        logger.groupEnd();
    }
    
    async function animateEvents(events) {
        for (const event of events) {
            switch (event.type) {
                case 'move':
                    await ui.animatePieceMove(event.pieceId, event.toPos.row, event.toPos.col);
                    break;
                case 'capture':
                    ui.showMessage(`Piece ${event.pieceId} captured! Reason: ${event.reason}.`);
                    await ui.animatePieceRemoval(event.pieceId, event.reason);
                    break;
                case 'observation':
                    ui.showMessage(`Observation! A ${event.isGhost ? 'ghost' : 'piece'} of ${event.jumpedId} was jumped.`);
                    await new Promise(r => setTimeout(r, 200));
                    break;
                case 'collapse_move':
                    ui.showMessage(`Collapse! Piece ${event.pieceId} moved to a prior state.`);
                    await ui.animatePieceMove(event.pieceId, event.toPos.row, event.toPos.col, true);
                    break;
                case 'king':
                case 'cascade_start':
                case 'interference':
                    break;
            }
        }
        // The main render call is now handled after events are processed.
    }
    
    // --- UI State Management ---

    function selectPiece(pieceId) {
        uiState.selectedPieceId = pieceId;
        const possibleMoves = logic.getPossibleMoves(pieceId, gameState.pieces, gameState.boardState);
        ui.displaySelection(pieceId, possibleMoves);
    }

    function resetSelection() {
        uiState.selectedPieceId = null;
        uiState.isMultiJump = false;
        ui.clearHighlights();
    }

    function updateStatusMessage() {
        if (uiState.gameOver) return;
        let message;
        if (uiState.isMultiJump) {
            const furtherJumps = logic.getPossibleMoves(uiState.selectedPieceId, gameState.pieces, gameState.boardState).filter(m => m.jumpedInfo);
            const hasMandatory = furtherJumps.some(m => m.jumpedInfo.some(j => !j.isGhost));
            message = hasMandatory ? "Complete the mandatory jump!" : "Optional jump available. Click piece to pass.";
        } else {
            message = `${gameState.turn === 'r' ? "Red" : "Black"}'s Turn`;
        }
        ui.updateStatus(message);
    }

    function handleGameOver(winner) {
        uiState.gameOver = true;
        let message;
        if (uiState.gameMode === 'ai') {
            message = (winner === AI_PLAYER) ? "The AI wins!" : "You win!";
        } else {
            message = `${winner === 'r' ? "Red" : "Black"} wins by quantum entanglement!`;
        }
        ui.endGame(message);
    }

    // --- Event Listeners for Global Events ---
    
    window.addEventListener('modeSelect', (e) => {
        ui.toggleGameModeModal(false);
        startGame(e.detail);
    });
    
    window.addEventListener('gamereset', () => {
        if (uiState.gameMode) startGame(uiState.gameMode);
    });
    
    window.addEventListener('returntomenu', () => {
        returnToMainMenu();
    });

    window.addEventListener('gameundo', () => {
        if (uiState.isAnimating || gameHistory.length === 0) {
            ui.showMessage("Cannot undo now.");
            return;
        }
        
        logger.info('Undo', 'Reverting to previous game state.');
        
        const undoCount = (uiState.gameMode === 'ai' && gameState.turn === 'r' && gameHistory.length >= 2) ? 2 : 1;

        for (let i = 0; i < undoCount; i++) {
            gameState = gameHistory.pop();
        }

        resetSelection();
        uiState.gameOver = false;
        document.getElementById('board').style.pointerEvents = 'auto';
        
        ui.renderFullState(gameState.pieces, gameState.redCaptured, gameState.blackCaptured, true);
        updateStatusMessage();
    });

    // --- Initial Setup ---
    returnToMainMenu(); // Start the app at the main menu.
});

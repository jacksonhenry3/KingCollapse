// js/main.js
// Main game controller. Manages state, handles user input, and orchestrates the game flow.
// Follows a unidirectional data flow: (Input -> Controller -> Logic -> State -> UI)

import logger from './logger.js';
import * as logic from './gameLogic.js';
import { initUI } from './ui.js';
import { getAIMove } from './ai.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Game State ---
    // The single source of truth for the game's current state.
    let gameState = {
        pieces: {},
        boardState: [],
        turn: 'r',
        redCaptured: [],
        blackCaptured: [],
    };
    let gameHistory = []; // Stores previous game states for the undo feature.
    
    // --- UI/Controller State ---
    // State related to the UI and current player interaction, not the game rules.
    let uiState = {
        selectedPieceId: null,
        isAnimating: false,
        isMultiJump: false,
        gameMode: null, // 'human' or 'ai'
        gameOver: false,
    };
    const AI_PLAYER = 'b';

    // Initialize UI and provide callbacks for user actions
    const ui = initUI({ onSquareClick: handleSquareClick });

    // --- Core Game Flow ---

    /**
     * Sets up and starts a new game.
     * @param {string} mode - The selected game mode ('human' or 'ai').
     */
    function startGame(mode) {
        logger.group("NEW GAME");
        uiState.gameMode = mode;
        uiState.gameOver = false;
        document.getElementById('board').style.pointerEvents = 'auto';

        const { pieces, boardState } = logic.createInitialState();
        gameState = {
            pieces,
            boardState,
            turn: 'r',
            redCaptured: [],
            blackCaptured: [],
        };
        gameHistory = [];
        resetSelection();

        ui.renderBoard();
        ui.renderFullState(gameState.pieces, gameState.redCaptured, gameState.blackCaptured);
        updateStatusMessage();
        logger.info('Game Start', `Mode: ${uiState.gameMode}. Red player starts.`);
        logger.groupEnd();
    }

    /**
     * Handles clicks on any square on the board.
     * @param {Event} e - The click event.
     */
    async function handleSquareClick(e) {
        if (uiState.isAnimating || uiState.gameOver || (uiState.gameMode === 'ai' && gameState.turn === AI_PLAYER)) {
            return;
        }

        const square = e.currentTarget;
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);

        if (uiState.selectedPieceId) {
            // Player is trying to make a move with the selected piece.
            const possibleMoves = logic.getPossibleMoves(uiState.selectedPieceId, gameState.pieces, gameState.boardState);
            const targetMove = possibleMoves.find(move => move.endRow === row && move.endCol === col);

            if (targetMove) {
                await processMove(uiState.selectedPieceId, targetMove);
            } else if (uiState.isMultiJump) {
                // If in a multi-jump, check if clicking the piece again means they want to pass an optional jump.
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
                // Invalid move, so deselect.
                resetSelection();
            }
        } else {
            // No piece is selected, so try to select one.
            const pieceId = gameState.boardState[row][col];
            if (pieceId && gameState.pieces[pieceId]?.player === gameState.turn) {
                selectPiece(pieceId);
            }
        }
    }

    /**
     * Processes a move, gets events from the logic engine, and triggers animations.
     * @param {string} pieceId - The ID of the piece to move.
     * @param {object} move - The move object.
     */
    async function processMove(pieceId, move) {
        if (uiState.isAnimating) return;
        uiState.isAnimating = true;
        logger.group(`PROCESS MOVE: Piece ${pieceId}`);

        gameHistory.push(JSON.parse(JSON.stringify(gameState)));
        resetSelection();

        // 1. Get the new state and events from the logic engine.
        const { newState, events } = logic.applyMove(gameState, pieceId, move);
        
        // 2. *** FIX: Commit the new state *before* animating. ***
        // This ensures the final re-render uses the correct, updated state.
        const newRedCaptured = [...gameState.redCaptured];
        const newBlackCaptured = [...gameState.blackCaptured];
        events.forEach(event => {
            if (event.type === 'capture') {
                (event.player === 'r' ? newRedCaptured : newBlackCaptured).push(event.pieceId);
            }
        });

        gameState = {
            ...gameState, // keeps turn, etc. which is updated in endTurn()
            pieces: newState.pieces,
            boardState: newState.boardState,
            redCaptured: newRedCaptured,
            blackCaptured: newBlackCaptured
        };

        // 3. Animate the events based on the list we received.
        await animateEvents(events);
        
        // 4. Check for multi-jump or end the turn.
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

    /**
     * Finalizes the current turn, switches players, and checks for game over.
     */
    function endTurn() {
        gameState.turn = (gameState.turn === 'r' ? 'b' : 'r');
        resetSelection();

        const winner = logic.checkWinCondition(gameState.pieces, gameState.turn, gameState.boardState);
        if (winner) {
            handleGameOver(winner);
        } else {
            updateStatusMessage();
            uiState.isAnimating = false;
            // Trigger AI turn if applicable
            if (uiState.gameMode === 'ai' && gameState.turn === AI_PLAYER) {
                setTimeout(makeAIMove, 500);
            }
        }
    }

    /**
     * Gets a move from the AI and processes it.
     */
    async function makeAIMove() {
        if (uiState.isAnimating || uiState.gameOver) return;
        uiState.isAnimating = true;
        logger.group("AI TURN");

        const mustMoveId = uiState.isMultiJump ? uiState.selectedPieceId : null;
        const aiMove = getAIMove(gameState, mustMoveId);

        if (aiMove) {
            logger.info('AI', `Chose to move piece ${aiMove.pieceId}.`);
            selectPiece(aiMove.pieceId); // Briefly show AI selection
            await new Promise(resolve => setTimeout(resolve, 750));
            await processMove(aiMove.pieceId, aiMove);
        } else {
            // AI has no moves, which could be passing an optional jump or losing the game.
            logger.warn('AI', 'No moves available or chose to pass.');
            endTurn();
        }
        logger.groupEnd();
    }
    
    // --- Event Animation ---

    /**
     * Iterates through game events and plays the corresponding animations.
     * @param {Array<object>} events - The list of events from the game logic.
     */
    async function animateEvents(events) {
        for (const event of events) {
            switch (event.type) {
                case 'move':
                    await ui.animatePieceMove(event.pieceId, event.toPos.row, event.toPos.col);
                    break;
                case 'capture':
                    ui.showMessage(`Piece ${event.pieceId} captured! Reason: ${event.reason}.`);
                    // The animatePieceRemoval function in ui.js handles the visual removal and adding to graveyard.
                    await ui.animatePieceRemoval(event.pieceId);
                    break;
                case 'observation':
                    ui.showMessage(`Observation! A ${event.isGhost ? 'ghost' : 'piece'} of ${event.jumpedId} was jumped.`);
                    await new Promise(r => setTimeout(r, 200)); // small delay
                    break;
                case 'collapse_move':
                    ui.showMessage(`Collapse! Piece ${event.pieceId} moved to a prior state.`);
                    await ui.animatePieceMove(event.pieceId, event.toPos.row, event.toPos.col, true);
                    break;
                // Other events can be handled here for more detailed animations or sounds
                case 'king':
                case 'cascade_start':
                case 'interference':
                    break;
            }
        }
        // This final re-render now correctly uses the updated gameState.
        ui.renderFullState(gameState.pieces, gameState.redCaptured, gameState.blackCaptured);
    }
    
    // --- UI State Management ---

    /**
     * Selects a piece and shows its possible moves.
     * @param {string} pieceId - The ID of the piece to select.
     */
    function selectPiece(pieceId) {
        uiState.selectedPieceId = pieceId;
        const possibleMoves = logic.getPossibleMoves(pieceId, gameState.pieces, gameState.boardState);
        ui.displaySelection(pieceId, possibleMoves);
    }

    /**
     * Clears any piece selection and highlights.
     */
    function resetSelection() {
        uiState.selectedPieceId = null;
        uiState.isMultiJump = false;
        ui.clearHighlights();
    }

    /**
     * Updates the status display with the current turn or action.
     */
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

    /**
     * Handles the end of the game.
     * @param {string} winner - The winning player ('r' or 'b').
     */
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

    // --- Event Listeners for Buttons/Modals ---
    
    window.addEventListener('modeSelect', (e) => {
        ui.hideGameModeModal();
        startGame(e.detail);
    });
    
    window.addEventListener('gamereset', () => {
        if (uiState.gameMode) startGame(uiState.gameMode);
    });
    
    window.addEventListener('gameundo', () => {
        if (uiState.isAnimating || gameHistory.length === 0) {
            ui.showMessage("Cannot undo now.");
            return;
        }
        
        logger.info('Undo', 'Reverting to previous game state.');
        
        // In AI mode, undoing your move should also undo the AI's response.
        const undoCount = (uiState.gameMode === 'ai' && gameState.turn === 'r' && gameHistory.length >= 2) ? 2 : 1;

        for (let i = 0; i < undoCount; i++) {
            gameState = gameHistory.pop();
        }

        resetSelection();
        uiState.gameOver = false;
        document.getElementById('board').style.pointerEvents = 'auto';
        
        ui.renderFullState(gameState.pieces, gameState.redCaptured, gameState.blackCaptured);
        updateStatusMessage();
    });
});

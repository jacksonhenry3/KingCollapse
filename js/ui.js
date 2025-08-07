// js/ui.js
// All functions related to DOM manipulation and rendering.

import logger from './logger.js';
import { getPossibleMoves } from './gameLogic.js';

export function initUI() {
    const elements = {
        board: document.getElementById('board'),
        ghostLayer: document.getElementById('ghost-layer'),
        pieceLayer: document.getElementById('piece-layer'),
        statusDisplay: document.getElementById('status-display'),
        resetButton: document.getElementById('reset-button'),
        undoButton: document.getElementById('undo-button'),
        tutorialButton: document.getElementById('tutorial-button'),
        closeTutorialButton: document.getElementById('close-tutorial-button'),
        tutorialModal: document.getElementById('tutorial-modal'),
        messageBox: document.getElementById('message-box'),
        messageText: document.getElementById('message-text'),
        gameModeModal: document.getElementById('game-mode-modal'),
        playHumanBtn: document.getElementById('play-human-btn'),
        playAiBtn: document.getElementById('play-ai-btn'),
        redGraveyard: document.getElementById('red-graveyard'),
        blackGraveyard: document.getElementById('black-graveyard'),
    };

    function getPixelPosition(row, col) {
        const squareSize = elements.board.clientWidth / 8;
        const pieceSize = squareSize * 0.8;
        const offset = (squareSize - pieceSize) / 2;
        return {
            top: row * squareSize + offset,
            left: col * squareSize + offset,
        };
    }

    function createPieceElement(piece) {
        const pieceElement = document.createElement('div');
        pieceElement.id = `piece-${piece.id}`;
        pieceElement.className = `piece ${piece.player === 'r' ? 'red-piece' : 'black-piece'}`;
        
        const idElement = document.createElement('span');
        idElement.className = 'piece-id';
        idElement.textContent = piece.id.substring(1);
        pieceElement.appendChild(idElement);

        if (piece.isKing) pieceElement.classList.add('king');
        
        const { top, left } = getPixelPosition(piece.history.at(-1).row, piece.history.at(-1).col);
        pieceElement.style.top = `${top}px`;
        pieceElement.style.left = `${left}px`;

        return pieceElement;
    }
    
    function addPieceToBoard(piece) {
        const pieceElement = createPieceElement(piece);
        elements.pieceLayer.appendChild(pieceElement);
        return pieceElement;
    }

    function renderBoard(squareClickHandler) {
        elements.board.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = document.createElement('div');
                square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = r;
                square.dataset.col = c;
                square.addEventListener('click', squareClickHandler);
                elements.board.appendChild(square);
            }
        }
    }

    function createGhostElement(piece, historyIndex, stackIndex = 0) {
        const pos = piece.history[historyIndex];
        const ghostElement = document.createElement('div');
        ghostElement.className = `ghost-piece ${piece.player === 'r' ? 'red-piece' : 'black-piece'}`;
        ghostElement.dataset.row = pos.row; // For easier querying
        ghostElement.dataset.col = pos.col; // For easier querying
        
        const squareSize = elements.board.clientWidth / 8;
        const ghostSize = 24;
        const padding = 4; 
        // **FIX**: Increased multiplier from 0.75 to 0.9 for more space.
        const stackOffset = stackIndex * (ghostSize * 0.9);

        ghostElement.style.top = `${pos.row * squareSize + padding}px`;
        ghostElement.style.left = `${pos.col * squareSize + padding + stackOffset}px`;

        const idElement = document.createElement('span');
        idElement.className = 'piece-id';
        idElement.textContent = piece.id.substring(1);
        ghostElement.appendChild(idElement);

        const orderElement = document.createElement('span');
        orderElement.className = 'ghost-order';
        orderElement.textContent = historyIndex + 1;
        ghostElement.appendChild(orderElement);
        
        return ghostElement;
    }

    // **FIX**: This function now reliably adds a single ghost, calculating its stack position.
    function addGhost(piece, historyIndex) {
        const pos = piece.history[historyIndex];
        const stackIndex = elements.ghostLayer.querySelectorAll(`.ghost-piece[data-row='${pos.row}'][data-col='${pos.col}']`).length;
        const ghostElement = createGhostElement(piece, historyIndex, stackIndex);
        elements.ghostLayer.appendChild(ghostElement);
    }

    function renderPieces(pieces, redCaptured, blackCaptured) {
        elements.pieceLayer.innerHTML = '';
        elements.ghostLayer.innerHTML = '';
        elements.redGraveyard.querySelectorAll('.captured-piece').forEach(el => el.remove());
        elements.blackGraveyard.querySelectorAll('.captured-piece').forEach(el => el.remove());

        redCaptured.forEach(id => addPieceToGraveyard('r', id));
        blackCaptured.forEach(id => addPieceToGraveyard('b', id));
        
        const ghostsBySquare = {};
        for (const id in pieces) {
            const piece = pieces[id];
            elements.pieceLayer.appendChild(createPieceElement(piece));
            
            piece.history.slice(0, -1).forEach((pos, historyIndex) => {
                const key = `${pos.row},${pos.col}`;
                if (!ghostsBySquare[key]) {
                    ghostsBySquare[key] = [];
                }
                ghostsBySquare[key].push({ piece, historyIndex });
            });
        }
        
        for (const key in ghostsBySquare) {
            const ghostsOnSquare = ghostsBySquare[key];
            ghostsOnSquare.forEach((ghostInfo, stackIndex) => {
                const { piece, historyIndex } = ghostInfo;
                const ghostElement = createGhostElement(piece, historyIndex, stackIndex);
                elements.ghostLayer.appendChild(ghostElement);
            });
        }
    }
    
    function addPieceToGraveyard(player, pieceId) {
        const capturedElement = document.createElement('div');
        capturedElement.className = `captured-piece ${player === 'r' ? 'red-piece' : 'black-piece'}`;
        capturedElement.textContent = pieceId.substring(1);
        const graveyard = player === 'r' ? elements.redGraveyard : elements.blackGraveyard;
        graveyard.appendChild(capturedElement);
    }

    function animatePieceMove(pieceId, toRow, toCol, isFast = false) {
        return new Promise(resolve => {
            const pieceElement = document.getElementById(`piece-${pieceId}`);
            if (!pieceElement) {
                resolve();
                return;
            }
            pieceElement.classList.add('is-moving');
            pieceElement.style.transitionDuration = isFast ? '0.15s' : '';

            const { top, left } = getPixelPosition(toRow, toCol);
            pieceElement.style.top = `${top}px`;
            pieceElement.style.left = `${left}px`;
            
            pieceElement.addEventListener('transitionend', function onEnd() {
                pieceElement.classList.remove('is-moving');
                pieceElement.style.transitionDuration = '';
                resolve();
            }, { once: true });
        });
    }
    
    function animatePieceRemoval(pieceId) {
        return new Promise(resolve => {
            const pieceElement = document.getElementById(`piece-${pieceId}`);
            if (!pieceElement) {
                resolve();
                return;
            }
            pieceElement.classList.add('removing');
            pieceElement.addEventListener('transitionend', () => {
                pieceElement.remove();
                resolve();
            }, { once: true });
        });
    }

    function highlightPieceAndMoves(pieceId, pieces, boardState) {
        clearHighlights();
        const pieceElement = document.getElementById(`piece-${pieceId}`);
        if (pieceElement) {
            pieceElement.classList.add('selected');
        }
        
        document.querySelectorAll('.possible-move').forEach(el => el.classList.remove('possible-move'));
        const moves = getPossibleMoves(pieceId, pieces, boardState);
        moves.forEach(move => {
            const moveSquare = elements.board.querySelector(`[data-row='${move.endRow}'][data-col='${move.endCol}']`);
            if (moveSquare) moveSquare.classList.add('possible-move');
        });
    }
    
    function clearHighlights() {
        document.querySelectorAll('.piece.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.square.possible-move').forEach(el => el.classList.remove('possible-move'));
    }

    function updateStatus(message, turn) {
        elements.statusDisplay.textContent = message || `${turn === 'r' ? "Red" : "Black"}'s Turn`;
    }
    
    function showMessage(text) {
        elements.messageText.textContent = text;
        elements.messageBox.style.opacity = '1';
        elements.messageBox.style.transform = 'translateY(0)';
        setTimeout(() => {
            elements.messageBox.style.opacity = '0';
            elements.messageBox.style.transform = 'translateY(-2.5rem)';
        }, 4000);
    }
    
    function toggleTutorial(show) {
        const modal = elements.tutorialModal;
        const content = modal.querySelector('.modal-content');
        if (show) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
            }, 10);
        } else {
            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    }

    function endGame(winner, gameMode) {
        let winnerName = (winner === 'r') ? "Red" : "Black";
        if (gameMode === 'ai' && winner === 'b') {
            winnerName = "The AI";
        } else if (gameMode === 'ai' && winner === 'r') {
            winnerName = "You";
        }
        updateStatus(`${winnerName} win${winnerName === 'You' ? '' : 's'} by quantum entanglement!`);
        elements.board.style.pointerEvents = 'none';
        logger.error('GAME OVER', `${winnerName} has won the game.`);
    }
    
    function hideGameModeModal() {
        elements.gameModeModal.classList.add('opacity-0');
        setTimeout(() => {
            elements.gameModeModal.classList.add('hidden');
        }, 300);
    }

    elements.playHumanBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('modeSelect', { detail: 'human' })));
    elements.playAiBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('modeSelect', { detail: 'ai' })));
    elements.resetButton.addEventListener('click', () => window.dispatchEvent(new Event('gamereset')));
    elements.undoButton.addEventListener('click', () => window.dispatchEvent(new Event('gameundo')));
    elements.tutorialButton.addEventListener('click', () => toggleTutorial(true));
    elements.closeTutorialButton.addEventListener('click', () => toggleTutorial(false));
    elements.tutorialModal.addEventListener('click', (e) => {
        if (e.target === elements.tutorialModal) toggleTutorial(false);
    });
    
    return {
        renderBoard,
        renderPieces,
        addGhost,
        addPieceToBoard,
        animatePieceMove,
        animatePieceRemoval,
        highlightPieceAndMoves,
        clearHighlights,
        updateStatus,
        showMessage,
        endGame,
        hideGameModeModal,
        elements,
    };
}

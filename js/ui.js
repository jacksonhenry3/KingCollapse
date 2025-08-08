// js/ui.js
// All functions related to DOM manipulation and rendering.
// This module is now "dumber" and only responsible for what the user sees.
// It receives data and instructions from the controller (main.js).

import logger from './logger.js';

export function initUI(callbacks) {
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

    /**
     * Calculates the pixel position for a piece on the board.
     * @param {number} row - The board row (0-7).
     * @param {number} col - The board column (0-7).
     * @returns {{top: number, left: number}}
     */
    function getPixelPosition(row, col) {
        const squareSize = elements.board.clientWidth / 8;
        const pieceSize = squareSize * 0.8;
        const offset = (squareSize - pieceSize) / 2;
        return {
            top: row * squareSize + offset,
            left: col * squareSize + offset,
        };
    }

    /**
     * Creates a DOM element for a game piece.
     * @param {object} piece - The piece data object.
     * @returns {HTMLElement}
     */
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

    /**
     * Renders the checkerboard squares and attaches event listeners.
     */
    function renderBoard() {
        elements.board.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = document.createElement('div');
                square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = r;
                square.dataset.col = c;
                square.addEventListener('click', (e) => callbacks.onSquareClick(e));
                elements.board.appendChild(square);
            }
        }
    }
    
    /**
     * Creates a DOM element for a ghost piece.
     * @param {object} piece - The piece data object.
     * @param {number} historyIndex - The index in the piece's history for this ghost.
     * @param {number} stackIndex - The stacking order on the square.
     * @returns {HTMLElement}
     */
    function createGhostElement(piece, historyIndex, stackIndex = 0) {
        const pos = piece.history[historyIndex];
        const ghostElement = document.createElement('div');
        ghostElement.className = `ghost-piece ${piece.player === 'r' ? 'red-piece' : 'black-piece'}`;
        ghostElement.dataset.row = pos.row;
        ghostElement.dataset.col = pos.col;
        
        const squareSize = elements.board.clientWidth / 8;
        const ghostSize = 24;
        const padding = 4;
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
    
    /**
     * Renders the entire game state from scratch. Used for initialization and undo.
     * @param {object} pieces - The state of all pieces.
     * @param {Array<string>} redCaptured - List of captured red piece IDs.
     * @param {Array<string>} blackCaptured - List of captured black piece IDs.
     */
    function renderFullState(pieces, redCaptured, blackCaptured) {
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
                if (!ghostsBySquare[key]) ghostsBySquare[key] = [];
                ghostsBySquare[key].push({ piece, historyIndex });
            });
        }
        
        for (const key in ghostsBySquare) {
            ghostsBySquare[key].forEach((ghostInfo, stackIndex) => {
                const { piece, historyIndex } = ghostInfo;
                const ghostElement = createGhostElement(piece, historyIndex, stackIndex);
                elements.ghostLayer.appendChild(ghostElement);
            });
        }
    }
    
    /**
     * Adds a captured piece to the appropriate graveyard display.
     * @param {string} player - The player of the captured piece ('r' or 'b').
     * @param {string} pieceId - The ID of the captured piece.
     */
    function addPieceToGraveyard(player, pieceId) {
        const capturedElement = document.createElement('div');
        capturedElement.className = `captured-piece ${player === 'r' ? 'red-piece' : 'black-piece'}`;
        capturedElement.textContent = pieceId.substring(1);
        const graveyard = player === 'r' ? elements.redGraveyard : elements.blackGraveyard;
        graveyard.appendChild(capturedElement);
    }

    /**
     * Animates a piece moving from its current position to a new one.
     * @param {string} pieceId - The ID of the piece to animate.
     * @param {number} toRow - The destination row.
     * @param {number} toCol - The destination column.
     * @param {boolean} isFast - Whether to use a faster animation speed.
     * @returns {Promise<void>}
     */
    function animatePieceMove(pieceId, toRow, toCol, isFast = false) {
        return new Promise(resolve => {
            const pieceElement = document.getElementById(`piece-${pieceId}`);
            if (!pieceElement) return resolve();
            
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
    
    /**
     * Animates the removal of a piece from the board.
     * @param {string} pieceId - The ID of the piece to remove.
     * @returns {Promise<void>}
     */
    function animatePieceRemoval(pieceId) {
        return new Promise(resolve => {
            const pieceElement = document.getElementById(`piece-${pieceId}`);
            if (!pieceElement) return resolve();

            addPieceToGraveyard(pieceElement.classList.contains('red-piece') ? 'r' : 'b', pieceId.replace('piece-',''));
            pieceElement.classList.add('removing');
            pieceElement.addEventListener('transitionend', () => {
                pieceElement.remove();
                resolve();
            }, { once: true });
        });
    }

    /**
     * Displays the selected piece and its possible moves.
     * @param {string|null} pieceId - The ID of the piece to highlight.
     * @param {Array<object>} possibleMoves - A list of valid moves for the piece.
     */
    function displaySelection(pieceId, possibleMoves) {
        clearHighlights();
        if (pieceId) {
            document.getElementById(`piece-${pieceId}`)?.classList.add('selected');
        }
        possibleMoves.forEach(move => {
            const moveSquare = elements.board.querySelector(`[data-row='${move.endRow}'][data-col='${move.endCol}']`);
            if (moveSquare) moveSquare.classList.add('possible-move');
        });
    }
    
    /**
     * Removes all selection and move highlights from the board.
     */
    function clearHighlights() {
        document.querySelectorAll('.piece.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.square.possible-move').forEach(el => el.classList.remove('possible-move'));
    }

    /**
     * Updates the main status display message.
     * @param {string} message - The text to display.
     */
    function updateStatus(message) {
        elements.statusDisplay.textContent = message;
    }
    
    /**
     * Shows a temporary message notification.
     * @param {string} text - The message to show.
     */
    function showMessage(text) {
        elements.messageText.textContent = text;
        elements.messageBox.style.opacity = '1';
        elements.messageBox.style.transform = 'translateY(0)';
        setTimeout(() => {
            elements.messageBox.style.opacity = '0';
            elements.messageBox.style.transform = 'translateY(-2.5rem)';
        }, 4000);
    }
    
    /**
     * Shows or hides the tutorial modal.
     * @param {boolean} show - True to show, false to hide.
     */
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

    /**
     * Displays the end game message and disables the board.
     * @param {string} message - The final message to display.
     */
    function endGame(message) {
        updateStatus(message);
        elements.board.style.pointerEvents = 'none';
        logger.error('GAME OVER', message);
    }
    
    /**
     * Hides the initial game mode selection modal.
     */
    function hideGameModeModal() {
        elements.gameModeModal.classList.add('opacity-0');
        setTimeout(() => {
            elements.gameModeModal.classList.add('hidden');
        }, 300);
    }
    
    // Event listeners now fire custom events handled by the controller.
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
        renderFullState,
        animatePieceMove,
        animatePieceRemoval,
        displaySelection,
        clearHighlights,
        updateStatus,
        showMessage,
        endGame,
        hideGameModeModal,
    };
}

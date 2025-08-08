// js/ui.js
// All functions related to DOM manipulation and rendering.

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
    
    function createGhostElement(piece, historyIndex, stackIndex = 0) {
        const pos = piece.history[historyIndex];
        const ghostElement = document.createElement('div');
        // Give each ghost a unique and predictable ID
        ghostElement.id = `ghost-${piece.id}-${historyIndex}`;
        ghostElement.className = `ghost-piece ${piece.player === 'r' ? 'red-piece' : 'black-piece'}`;
        
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
     * Synchronizes the entire visual state of the board with the game state.
     * This function handles animations for appearing/disappearing ghosts.
     * @param {object} pieces - The state of all pieces.
     * @param {Array<string>} redCaptured - List of captured red piece IDs.
     * @param {Array<string>} blackCaptured - List of captured black piece IDs.
     * @param {boolean} isHardReset - If true, skips animations (for new game/undo).
     */
    function syncVisuals(pieces, redCaptured, blackCaptured, isHardReset = false) {
        // --- Sync Pieces (simple redraw) ---
        elements.pieceLayer.innerHTML = '';
        for (const id in pieces) {
            elements.pieceLayer.appendChild(createPieceElement(pieces[id]));
        }

        
        

        // --- Sync Ghosts with Animation ---
        const requiredGhosts = new Map();
        const ghostsBySquare = {};

        // 1. Determine all ghosts that *should* be on the board.
        for (const id in pieces) {
            const piece = pieces[id];
            piece.history.slice(0, -1).forEach((pos, historyIndex) => {
                const key = `ghost-${id}-${historyIndex}`;
                requiredGhosts.set(key, { piece, historyIndex, pos });

                const squareKey = `${pos.row},${pos.col}`;
                if (!ghostsBySquare[squareKey]) ghostsBySquare[squareKey] = [];
                ghostsBySquare[squareKey].push(key);
                logger.info('Required ghost', key, 'for piece', piece.id, 'at', pos.row, pos.col, 'history index', historyIndex, 'square key', squareKey);
            });
        }

                // NEW: Sort ghosts on each square by history index for stable stacking.
                for (const squareKey in ghostsBySquare) {
                    ghostsBySquare[squareKey].sort((keyA, keyB) => {
                        const ghostA = requiredGhosts.get(keyA);
                        const ghostB = requiredGhosts.get(keyB);
                        return ghostA.historyIndex - ghostB.historyIndex;
                    });
                }

        const domGhosts = new Map();
        elements.ghostLayer.querySelectorAll('.ghost-piece').forEach(el => {
            domGhosts.set(el.id, el);
        });

        // 2. Animate OUT ghosts that are in the DOM but no longer required.
        domGhosts.forEach((el, id) => {
            if (!requiredGhosts.has(id)) {
                if (isHardReset) {
                    el.remove();
                } else {
                    el.classList.add('removing');
                    el.addEventListener('transitionend', () => el.remove(), { once: true });
                }
            }
        });

        // 3. Animate IN ghosts that are required but not yet in the DOM.
        requiredGhosts.forEach(({ piece, historyIndex, pos }, key) => {
            if (!domGhosts.has(key)) {
                const squareKey = `${pos.row},${pos.col}`;
                const stackIndex = ghostsBySquare[squareKey].indexOf(key);
                logger.info('Creating ghost', key, 'for piece', piece.id, 'at', pos.row, pos.col, 'stack index', stackIndex, 'history index', historyIndex, 'square key', squareKey);
                const ghostElement = createGhostElement(piece, historyIndex, stackIndex);
                
                if (isHardReset) {
                    elements.ghostLayer.appendChild(ghostElement);
                } else {
                    ghostElement.classList.add('adding');
                    elements.ghostLayer.appendChild(ghostElement);
                setTimeout(() => {
                    ghostElement.classList.remove('adding');
                }, 0);
                }
            }
        });

        // --- Sync Graveyards (simple redraw) ---
        elements.redGraveyard.querySelectorAll('.captured-piece').forEach(el => el.remove());
        elements.blackGraveyard.querySelectorAll('.captured-piece').forEach(el => el.remove());
        redCaptured.forEach(id => addPieceToGraveyard('r', id));
        blackCaptured.forEach(id => addPieceToGraveyard('b', id));
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
    
    function clearHighlights() {
        document.querySelectorAll('.piece.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.square.possible-move').forEach(el => el.classList.remove('possible-move'));
    }

    function updateStatus(message) {
        elements.statusDisplay.textContent = message;
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

    function endGame(message) {
        updateStatus(message);
        elements.board.style.pointerEvents = 'none';
        logger.error('GAME OVER', message);
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
        // The old renderFullState is now syncVisuals with the hard reset flag
        renderFullState: (pieces, red, black) => syncVisuals(pieces, red, black, true),
        syncVisuals,
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

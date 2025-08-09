// js/ui.js
// All functions related to DOM manipulation and rendering.

import logger from './logger.js';

export function initUI(callbacks) {
    const elements = {
        // Views
        mainMenu: document.getElementById('main-menu'),
        gameView: document.getElementById('game-view'),

        // Game elements
        board: document.getElementById('board'),
        ghostLayer: document.getElementById('ghost-layer'),
        pieceLayer: document.getElementById('piece-layer'),
        statusDisplay: document.getElementById('status-display'),
        redGraveyard: document.getElementById('red-graveyard'),
        blackGraveyard: document.getElementById('black-graveyard'),
        
        // In-Game Buttons
        resetButton: document.getElementById('reset-button'),
        undoButton: document.getElementById('undo-button'),
        mainMenuButton: document.getElementById('main-menu-button'),

        // Main Menu Buttons
        menuNewGameBtn: document.getElementById('menu-new-game-btn'),
        menuHowToPlayBtn: document.getElementById('menu-how-to-play-btn'),
        menuOptionsBtn: document.getElementById('menu-options-btn'),

        // Modals & Messages
        tutorialModal: document.getElementById('tutorial-modal'),
        closeTutorialButton: document.getElementById('close-tutorial-button'),
        messageBox: document.getElementById('message-box'),
        messageText: document.getElementById('message-text'),
        gameModeModal: document.getElementById('game-mode-modal'),
        playHumanBtn: document.getElementById('play-human-btn'),
        playAiBtn: document.getElementById('play-ai-btn'),
    };

    /**
     * Controls which main view is visible.
     * @param {'menu' | 'game'} viewName - The view to show.
     */
    function showView(viewName) {
        elements.mainMenu.classList.add('hidden');
        elements.gameView.classList.add('hidden');

        if (viewName === 'menu') {
            elements.mainMenu.classList.remove('hidden');
        } else if (viewName === 'game') {
            elements.gameView.classList.remove('hidden');
        }
    }

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
    
    function renderGhosts(pieces, isAnimated = true) {
        elements.ghostLayer.innerHTML = '';
        const ghostsBySquare = {};

        for (const id in pieces) {
            const piece = pieces[id];
            // Create ghosts for all but the most recent history entry.
            piece.history.slice(0, -1).forEach((pos, historyIndex) => {
                const squareKey = `${pos.row},${pos.col}`;
                if (!ghostsBySquare[squareKey]) ghostsBySquare[squareKey] = [];
                ghostsBySquare[squareKey].push({ piece, historyIndex });
            });
        }

        let delay = 0;
        
        // Process squares in a consistent order for deterministic animation.
        const sortedSquareKeys = Object.keys(ghostsBySquare).sort();

        for (const squareKey of sortedSquareKeys) {
            // Sort ghosts on the same square by their history index to stack them correctly.
            ghostsBySquare[squareKey].sort((a, b) => a.historyIndex - b.historyIndex);

            ghostsBySquare[squareKey].forEach(({ piece, historyIndex }, stackIndex) => {
                const ghostElement = createGhostElement(piece, historyIndex, stackIndex);
                elements.ghostLayer.appendChild(ghostElement);
                
                if (isAnimated) {
                    // Initial state for animation: invisible and scaled down.
                    ghostElement.style.opacity = '0';
                    ghostElement.style.transform = 'scale(0.5)';
                    // Stagger the animation start time.
                    setTimeout(() => {
                        ghostElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        ghostElement.style.opacity = '1';
                        ghostElement.style.transform = 'scale(1)';
                    }, delay);
                    delay += 50; 
                }
            });
        }
    }

    function renderFullState(pieces, redCaptured, blackCaptured, isHardReset = false) {
        // Render the active pieces on the board.
        elements.pieceLayer.innerHTML = '';
        for (const id in pieces) {
            elements.pieceLayer.appendChild(createPieceElement(pieces[id]));
        }

        // Render the ghost pieces with or without animation.
        renderGhosts(pieces, !isHardReset);

        // Update the captured pieces in the graveyards.
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
    
    function toggleModal(modal, show) {
        const content = modal.querySelector('.modal-content') || modal.children[0];
        if (show) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                if (content) content.classList.remove('scale-95');
            }, 10);
        } else {
            modal.classList.add('opacity-0');
            if (content) content.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    }

    function endGame(message) {
        updateStatus(message);
        elements.board.style.pointerEvents = 'none';
        logger.error('GAME OVER', message);
    }
    
    // --- Event Listeners ---
    elements.menuNewGameBtn.addEventListener('click', () => toggleModal(elements.gameModeModal, true));
    elements.menuHowToPlayBtn.addEventListener('click', () => toggleModal(elements.tutorialModal, true));
    elements.menuOptionsBtn.addEventListener('click', () => showMessage("Options are not yet implemented."));

    elements.playHumanBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('modeSelect', { detail: 'human' })));
    elements.playAiBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('modeSelect', { detail: 'ai' })));
    
    elements.resetButton.addEventListener('click', () => window.dispatchEvent(new Event('gamereset')));
    elements.undoButton.addEventListener('click', () => window.dispatchEvent(new Event('gameundo')));
    elements.mainMenuButton.addEventListener('click', () => window.dispatchEvent(new Event('returntomenu')));

    elements.closeTutorialButton.addEventListener('click', () => toggleModal(elements.tutorialModal, false));
    elements.tutorialModal.addEventListener('click', (e) => {
        if (e.target === elements.tutorialModal) toggleModal(elements.tutorialModal, false);
    });
    
    return {
        showView,
        renderBoard,
        renderFullState,
        animatePieceMove,
        animatePieceRemoval,
        displaySelection,
        clearHighlights,
        updateStatus,
        showMessage,
        endGame,
        toggleGameModeModal: (show) => toggleModal(elements.gameModeModal, show),
    };
}

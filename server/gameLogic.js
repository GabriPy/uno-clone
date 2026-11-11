const COLORS = ['Blue', 'Green', 'Red', 'Yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'Draw'];
const WILD_CARDS = ['Wild', 'Wild_Draw'];

function createDeck() {
    let deck = [];
    
    // Add colored cards
    COLORS.forEach(color => {
        VALUES.forEach(value => {
            // One '0' per color, two of everything else
            const count = value === '0' ? 1 : 2;
            for (let i = 0; i < count; i++) {
                deck.push({ color, value, type: 'normal' });
            }
        });
    });

    // Add wild cards
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'Wild', value: 'Wild', type: 'wild' });
        deck.push({ color: 'Wild', value: 'Wild_Draw', type: 'wild_draw' });
    }

    return shuffle(deck);
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function canPlay(card, topCard, currentColor) {
    if (card.color === 'Wild' || card.type === 'wild' || card.type === 'wild_draw') {
        return true;
    }
    if (card.color === currentColor || card.value === topCard.value) {
        return true;
    }
    return false;
}

module.exports = {
    createDeck,
    shuffle,
    canPlay,
    COLORS
};

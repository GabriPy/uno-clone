const db = require('./db');
const { createDeck, canPlay, COLORS } = require('./gameLogic');

const parseData = (data) => {
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
};

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('join_room', async ({ nickname, roomName }) => {
            try {
                // Find or create room
                let [rooms] = await db.execute('SELECT * FROM rooms WHERE name = ?', [roomName]);
                let roomId;

                if (rooms.length === 0) {
                    const [result] = await db.execute('INSERT INTO rooms (name) VALUES (?)', [roomName]);
                    roomId = result.insertId;
                } else {
                    roomId = rooms[0].id;
                    if (rooms[0].status !== 'waiting') {
                        socket.emit('error', 'Game already in progress in this room');
                        return;
                    }
                }

                // Add player
                const [playersInRoom] = await db.execute('SELECT * FROM players WHERE room_id = ?', [roomId]);
                const isHost = playersInRoom.length === 0;
                
                await db.execute(
                    'INSERT INTO players (room_id, nickname, socket_id, is_host) VALUES (?, ?, ?, ?)',
                    [roomId, nickname, socket.id, isHost]
                );

                socket.join(roomName);
                
                // Get updated player list
                const [updatedPlayers] = await db.execute('SELECT id, nickname, is_host FROM players WHERE room_id = ?', [roomId]);
                
                io.to(roomName).emit('room_update', {
                    roomId,
                    roomName,
                    players: updatedPlayers
                });

                socket.emit('joined_successfully', { roomId, roomName, isHost });

            } catch (err) {
                console.error(err);
                socket.emit('error', 'Failed to join room');
            }
        });

        socket.on('start_game', async ({ roomId }) => {
            try {
                const [players] = await db.execute('SELECT * FROM players WHERE room_id = ?', [roomId]);
                if (players.length < 2) {
                    socket.emit('error', 'Need at least 2 players to start');
                    return;
                }

                // Initialize game
                const deck = createDeck();
                const hands = {};
                
                // Deal 7 cards to each player
                players.forEach(player => {
                    hands[player.id] = deck.splice(0, 7);
                });

                // Update players' hands in DB
                for (const player of players) {
                    await db.execute('UPDATE players SET hand = ?, turn_order = ? WHERE id = ?', [
                        JSON.stringify(hands[player.id]),
                        players.indexOf(player),
                        player.id
                    ]);
                }

                // Initial discard pile
                let firstCard = deck.pop();
                while (firstCard.color === 'Wild') {
                    deck.unshift(firstCard);
                    firstCard = deck.pop();
                }

                await db.execute('UPDATE rooms SET status = "playing" WHERE id = ?', [roomId]);
                
                await db.execute(
                    'INSERT INTO games (room_id, current_turn_player_id, current_color, current_value, deck, discard_pile) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        roomId,
                        players[0].id,
                        firstCard.color,
                        firstCard.value,
                        JSON.stringify(deck),
                        JSON.stringify([firstCard])
                    ]
                );

                io.to((await getRoomName(roomId))).emit('game_started', {
                    currentTurnPlayerId: players[0].id,
                    topCard: firstCard,
                    currentColor: firstCard.color
                });

                // Send private hands to each player
                players.forEach(player => {
                    io.to(player.socket_id).emit('your_hand', hands[player.id]);
                });

            } catch (err) {
                console.error(err);
                socket.emit('error', 'Failed to start game');
            }
        });

        socket.on('play_card', async ({ roomId, playerId, cardIndex, chosenColor }) => {
            try {
                const [[game]] = await db.execute('SELECT * FROM games WHERE room_id = ?', [roomId]);
                if (game.current_turn_player_id !== playerId) {
                    socket.emit('error', 'Not your turn');
                    return;
                }

                const [[player]] = await db.execute('SELECT * FROM players WHERE id = ?', [playerId]);
                let hand = parseData(player.hand);
                const card = hand[cardIndex];

                if (!canPlay(card, { color: game.current_color, value: game.current_value }, game.current_color)) {
                    socket.emit('error', 'Invalid move');
                    return;
                }

                // Remove card from hand
                hand.splice(cardIndex, 1);
                await db.execute('UPDATE players SET hand = ? WHERE id = ?', [JSON.stringify(hand), playerId]);

                // Update game state
                let newColor = card.color === 'Wild' ? chosenColor : card.color;
                let newValue = card.value;
                let discardPile = parseData(game.discard_pile);
                discardPile.push(card);

                // Handle special cards
                let direction = game.direction;
                let skipNext = false;
                let drawCount = 0;

                if (card.value === 'Reverse') {
                    direction *= -1;
                } else if (card.value === 'Skip') {
                    skipNext = true;
                } else if (card.value === 'Draw') {
                    drawCount = 2;
                    skipNext = true;
                } else if (card.value === 'Wild_Draw') {
                    drawCount = 4;
                    skipNext = true;
                }

                // Calculate next turn
                const [players] = await db.execute('SELECT id FROM players WHERE room_id = ? ORDER BY turn_order ASC', [roomId]);
                let currentIndex = players.findIndex(p => p.id === playerId);
                let nextIndex = (currentIndex + direction + players.length) % players.length;
                
                if (skipNext) {
                    nextIndex = (nextIndex + direction + players.length) % players.length;
                }

                // Handle drawing cards for next player
                if (drawCount > 0) {
                    const victimPlayerId = players[(currentIndex + direction + players.length) % players.length].id;
                    const [[victim]] = await db.execute('SELECT * FROM players WHERE id = ?', [victimPlayerId]);
                    let victimHand = parseData(victim.hand);
                    let deck = parseData(game.deck);
                    
                    for (let i = 0; i < drawCount; i++) {
                        if (deck.length === 0) {
                            // Reshuffle discard pile
                            const lastCard = discardPile.pop();
                            deck = createDeck(); // Simplified: just new deck
                            discardPile = [lastCard];
                        }
                        victimHand.push(deck.pop());
                    }
                    
                    await db.execute('UPDATE players SET hand = ? WHERE id = ?', [JSON.stringify(victimHand), victimPlayerId]);
                    await db.execute('UPDATE games SET deck = ? WHERE room_id = ?', [JSON.stringify(deck), roomId]);
                    
                    io.to(victim.socket_id).emit('your_hand', victimHand);
                }

                await db.execute(
                    'UPDATE games SET current_turn_player_id = ?, current_color = ?, current_value = ?, direction = ?, discard_pile = ? WHERE room_id = ?',
                    [players[nextIndex].id, newColor, newValue, direction, JSON.stringify(discardPile), roomId]
                );

                const roomName = await getRoomName(roomId);
                io.to(roomName).emit('card_played', {
                    playerId,
                    card,
                    newColor,
                    nextTurnPlayerId: players[nextIndex].id,
                    topCard: card
                });

                socket.emit('your_hand', hand);

                // Check for winner
                if (hand.length === 0) {
                    io.to(roomName).emit('game_over', { winnerId: playerId, nickname: player.nickname });
                    await db.execute('UPDATE rooms SET status = "finished" WHERE id = ?', [roomId]);
                }

            } catch (err) {
                console.error(err);
                socket.emit('error', 'Failed to play card');
            }
        });

        socket.on('draw_card', async ({ roomId, playerId }) => {
            try {
                const [[game]] = await db.execute('SELECT * FROM games WHERE room_id = ?', [roomId]);
                if (game.current_turn_player_id !== playerId) {
                    socket.emit('error', 'Not your turn');
                    return;
                }

                const [[player]] = await db.execute('SELECT * FROM players WHERE id = ?', [playerId]);
                let hand = parseData(player.hand);
                let deck = parseData(game.deck);

                if (deck.length === 0) {
                    // Reshuffle simplified
                    deck = createDeck();
                }

                const drawnCard = deck.pop();
                hand.push(drawnCard);

                await db.execute('UPDATE players SET hand = ? WHERE id = ?', [JSON.stringify(hand), playerId]);
                await db.execute('UPDATE games SET deck = ? WHERE room_id = ?', [JSON.stringify(deck), roomId]);

                socket.emit('your_hand', hand);
                
                // If can't play, pass turn (simplified: always pass turn for now if user wants, or just draw)
                // In some rules, you can play if you draw a playable card. For simplicity, we just draw.
                
                const [players] = await db.execute('SELECT id FROM players WHERE room_id = ? ORDER BY turn_order ASC', [roomId]);
                let currentIndex = players.findIndex(p => p.id === playerId);
                let nextIndex = (currentIndex + game.direction + players.length) % players.length;

                await db.execute('UPDATE games SET current_turn_player_id = ? WHERE room_id = ?', [players[nextIndex].id, roomId]);

                const roomName = await getRoomName(roomId);
                io.to(roomName).emit('card_drawn', {
                    playerId,
                    nextTurnPlayerId: players[nextIndex].id
                });

            } catch (err) {
                console.error(err);
                socket.emit('error', 'Failed to draw card');
            }
        });

        socket.on('disconnect', async () => {
            const [players] = await db.execute('SELECT * FROM players WHERE socket_id = ?', [socket.id]);
            if (players.length > 0) {
                const player = players[0];
                await db.execute('DELETE FROM players WHERE id = ?', [player.id]);
                
                const roomName = await getRoomName(player.room_id);
                const [remainingPlayers] = await db.execute('SELECT id, nickname, is_host FROM players WHERE room_id = ?', [player.room_id]);
                
                if (remainingPlayers.length === 0) {
                    await db.execute('DELETE FROM rooms WHERE id = ?', [player.room_id]);
                } else {
                    io.to(roomName).emit('room_update', {
                        roomId: player.room_id,
                        roomName,
                        players: remainingPlayers
                    });
                    
                    // If host left, assign new host
                    if (player.is_host) {
                        await db.execute('UPDATE players SET is_host = TRUE WHERE id = ?', [remainingPlayers[0].id]);
                        const [newPlayersList] = await db.execute('SELECT id, nickname, is_host FROM players WHERE room_id = ?', [player.room_id]);
                        io.to(roomName).emit('room_update', {
                            roomId: player.room_id,
                            roomName,
                            players: newPlayersList
                        });
                    }
                }
            }
        });
    });

    async function getRoomName(roomId) {
        const [[room]] = await db.execute('SELECT name FROM rooms WHERE id = ?', [roomId]);
        return room ? room.name : null;
    }
};

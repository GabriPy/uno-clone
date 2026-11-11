<template>
  <div class="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
    <!-- Join Screen -->
    <div v-if="state === 'join'" class="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
      <h1 class="text-4xl font-bold mb-6 text-center text-red-500">UNO Clone</h1>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Nickname</label>
          <input v-model="nickname" type="text" class="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-red-500" placeholder="Inserisci il tuo nickname">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Nome Stanza</label>
          <input v-model="roomName" type="text" class="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-red-500" placeholder="Nome della stanza">
        </div>
        <button @click="joinRoom" :disabled="!nickname || !roomName" class="w-full py-2 bg-red-600 hover:bg-red-700 rounded font-bold transition disabled:opacity-50">
          Entra nella Stanza
        </button>
      </div>
    </div>

    <!-- Lobby -->
    <div v-else-if="state === 'lobby'" class="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md text-center">
      <h2 class="text-2xl font-bold mb-4">Stanza: {{ roomName }}</h2>
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-2">Giocatori:</h3>
        <ul class="space-y-2">
          <li v-for="player in players" :key="player.id" class="p-2 bg-gray-700 rounded flex justify-between items-center">
            <span>{{ player.nickname }}</span>
            <span v-if="player.is_host" class="text-xs bg-yellow-600 px-2 py-1 rounded">HOST</span>
          </li>
        </ul>
      </div>
      <button v-if="isHost" @click="startGame" :disabled="players.length < 2" class="w-full py-2 bg-green-600 hover:bg-green-700 rounded font-bold transition disabled:opacity-50">
        Inizia Partita
      </button>
      <p v-else class="text-gray-400 italic">In attesa che l'host inizi la partita...</p>
    </div>

    <!-- Game Board -->
    <div v-else-if="state === 'game'" class="w-full h-full flex flex-col items-center">
      <!-- Opponents -->
      <div class="flex gap-4 mb-8">
        <div v-for="player in otherPlayers" :key="player.id" class="p-4 bg-gray-800 rounded-lg text-center" :class="{'ring-2 ring-yellow-500': currentTurnPlayerId === player.id}">
          <p class="font-bold">{{ player.nickname }}</p>
          <div class="w-12 h-16 bg-gray-600 rounded-md border-2 border-white mx-auto flex items-center justify-center text-xs">
            ?
          </div>
        </div>
      </div>

      <!-- Table Center -->
      <div class="relative flex items-center gap-12 mb-12">
        <!-- Deck -->
        <div @click="drawCard" class="cursor-pointer group">
          <img src="/cards/Deck.png" class="w-24 h-36 rounded-lg shadow-lg transform group-hover:-translate-y-2 transition" alt="Deck">
          <p class="text-center mt-2 text-sm text-gray-400">Pesca</p>
        </div>

        <!-- Discard Pile -->
        <div class="relative">
          <img v-if="topCard" :src="getCardImage(topCard)" class="w-24 h-36 rounded-lg shadow-lg border-2 border-white" alt="Top Card">
          <div v-if="topCard && topCard.color === 'Wild'" class="absolute -top-4 -right-4 w-8 h-8 rounded-full border-2 border-white" :style="{ backgroundColor: currentColor.toLowerCase() }"></div>
        </div>
      </div>

      <!-- Current Turn Indicator -->
      <div class="mb-8 text-xl font-bold">
        <span v-if="currentTurnPlayerId === myId" class="text-green-500">Tocca a te!</span>
        <span v-else class="text-gray-400">Tocca a {{ getCurrentTurnPlayerName() }}</span>
      </div>

      <!-- My Hand -->
      <div class="flex flex-wrap justify-center gap-2 max-w-5xl">
        <div v-for="(card, index) in hand" :key="index" @click="playCard(index)" 
             class="cursor-pointer transform hover:-translate-y-4 transition-all duration-200"
             :class="{'opacity-50 grayscale cursor-not-allowed': !isMyTurn || !canPlayCard(card)}">
          <img :src="getCardImage(card)" class="w-20 h-32 rounded-lg shadow-md border border-gray-700" :alt="card.value">
        </div>
      </div>

      <!-- Wild Color Picker Modal -->
      <div v-if="showColorPicker" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-gray-800 p-8 rounded-xl text-center">
          <h3 class="text-xl font-bold mb-6">Scegli un colore</h3>
          <div class="grid grid-cols-2 gap-4">
            <button v-for="color in colors" :key="color" @click="selectColor(color)" 
                    :class="getColorClass(color)" class="w-24 h-24 rounded-lg font-bold shadow-lg transform hover:scale-105 transition">
              {{ color }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Winner Modal -->
    <div v-if="winner" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-gray-800 p-8 rounded-xl text-center">
        <h2 class="text-4xl font-bold mb-4 text-yellow-500">Vincitore!</h2>
        <p class="text-2xl mb-6">{{ winner.nickname }} ha vinto la partita!</p>
        <button @click="resetGame" class="px-8 py-2 bg-red-600 hover:bg-red-700 rounded font-bold transition">
          Torna alla Lobby
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

const state = ref('join'); // join, lobby, game
const nickname = ref('');
const roomName = ref('');
const players = ref([]);
const isHost = ref(false);
const roomId = ref(null);
const myId = ref(null);

const hand = ref([]);
const topCard = ref(null);
const currentColor = ref('');
const currentTurnPlayerId = ref(null);
const winner = ref(null);

const showColorPicker = ref(false);
const pendingCardIndex = ref(null);
const colors = ['Red', 'Blue', 'Green', 'Yellow'];

const otherPlayers = computed(() => {
  // Simple rotation so current player is at bottom (not visible in this list)
  return players.value.filter(p => p.nickname !== nickname.value);
});

const isMyTurn = computed(() => currentTurnPlayerId.value === myId.value);

onMounted(() => {
  socket.on('room_update', (data) => {
    players.value = data.players;
    const me = data.players.find(p => p.nickname === nickname.value);
    if (me) {
      myId.value = me.id;
      isHost.value = me.is_host;
    }
  });

  socket.on('joined_successfully', (data) => {
    roomId.value = data.roomId;
    state.value = 'lobby';
  });

  socket.on('game_started', (data) => {
    state.value = 'game';
    currentTurnPlayerId.value = data.currentTurnPlayerId;
    topCard.value = data.topCard;
    currentColor.value = data.currentColor;
  });

  socket.on('your_hand', (newHand) => {
    hand.value = newHand;
  });

  socket.on('card_played', (data) => {
    topCard.value = data.topCard;
    currentColor.value = data.newColor;
    currentTurnPlayerId.value = data.nextTurnPlayerId;
  });

  socket.on('card_drawn', (data) => {
    currentTurnPlayerId.value = data.nextTurnPlayerId;
  });

  socket.on('game_over', (data) => {
    winner.value = data;
  });

  socket.on('error', (msg) => {
    alert(msg);
  });
});

const joinRoom = () => {
  socket.emit('join_room', { nickname: nickname.value, roomName: roomName.value });
};

const startGame = () => {
  socket.emit('start_game', { roomId: roomId.value });
};

const playCard = (index) => {
  if (!isMyTurn.value) return;
  
  const card = hand.value[index];
  if (!canPlayCard(card)) return;

  if (card.color === 'Wild') {
    pendingCardIndex.value = index;
    showColorPicker.value = true;
  } else {
    socket.emit('play_card', { 
      roomId: roomId.value, 
      playerId: myId.value, 
      cardIndex: index 
    });
  }
};

const selectColor = (color) => {
  socket.emit('play_card', { 
    roomId: roomId.value, 
    playerId: myId.value, 
    cardIndex: pendingCardIndex.value,
    chosenColor: color
  });
  showColorPicker.value = false;
  pendingCardIndex.value = null;
};

const drawCard = () => {
  if (!isMyTurn.value) return;
  socket.emit('draw_card', { roomId: roomId.value, playerId: myId.value });
};

const canPlayCard = (card) => {
  if (card.color === 'Wild') return true;
  if (card.color === currentColor.value) return true;
  if (card.value === topCard.value.value) return true;
  return false;
};

const getCardImage = (card) => {
  if (!card) return '/cards/Deck.png';
  if (card.color === 'Wild') {
    return `/cards/${card.value}.png`;
  }
  return `/cards/${card.color}_${card.value}.png`;
};

const getCurrentTurnPlayerName = () => {
  const p = players.value.find(p => p.id === currentTurnPlayerId.value);
  return p ? p.nickname : '...';
};

const getColorClass = (color) => {
  const classes = {
    'Red': 'bg-red-600 hover:bg-red-500',
    'Blue': 'bg-blue-600 hover:bg-blue-500',
    'Green': 'bg-green-600 hover:bg-green-500',
    'Yellow': 'bg-yellow-500 hover:bg-yellow-400 text-black'
  };
  return classes[color];
};

const resetGame = () => {
  state.value = 'lobby';
  winner.value = null;
  hand.value = [];
  topCard.value = null;
};
</script>

<style>
/* Add any custom animations here */
</style>

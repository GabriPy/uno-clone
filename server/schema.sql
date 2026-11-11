CREATE DATABASE IF NOT EXISTS uno_game;
USE uno_game;

CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    nickname VARCHAR(50) NOT NULL,
    socket_id VARCHAR(255),
    is_host BOOLEAN DEFAULT FALSE,
    turn_order INT DEFAULT 0,
    hand JSON, -- Stores the cards as a JSON array
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT UNIQUE,
    current_turn_player_id INT,
    current_color VARCHAR(10),
    current_value VARCHAR(20),
    direction TINYINT DEFAULT 1, -- 1 for clockwise, -1 for counter-clockwise
    deck JSON,
    discard_pile JSON,
    last_action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

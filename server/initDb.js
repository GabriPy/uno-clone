const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    });

    console.log('Connessione al database in corso...');

    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'uno_game'}\`;`);
    console.log(`Database ${process.env.DB_NAME || 'uno_game'} verificato/creato.`);

    await connection.query(`USE \`${process.env.DB_NAME || 'uno_game'}\`;`);

    // Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split schema into individual queries
    // This is a simple split, might need improvement for complex SQL
    const queries = schema
        .split(';')
        .map(q => q.trim())
        .filter(q => q.length > 0 && !q.startsWith('CREATE DATABASE') && !q.startsWith('USE'));

    for (let query of queries) {
        try {
            await connection.query(query);
        } catch (err) {
            console.error(`Errore durante l'esecuzione della query: ${query.substring(0, 50)}...`);
            console.error(err.message);
        }
    }

    console.log('Tabelle verificate/create correttamente.');
    await connection.end();
}

if (require.main === module) {
    initDatabase()
        .then(() => {
            console.log('Inizializzazione completata.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Errore durante l\'inizializzazione:', err);
            process.exit(1);
        });
}

module.exports = initDatabase;

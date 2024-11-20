const express = require('express');
const dotenv = require('dotenv');
const routes = require('./routes');
const cors = require('cors');
dotenv.config();

const app = express();

app.use(cors({
  ///origin: 'http://localhost:3001', // Substitua pelo domínio permitido
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
}));

app.use(express.json());
app.use('/api', routes);

module.exports = app;

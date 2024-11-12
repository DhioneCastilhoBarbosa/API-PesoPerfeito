const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Configuração do cliente DynamoDB v3
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDb = DynamoDBDocumentClient.from(client);

// Função de registro de usuário
exports.register = async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = uuidv4();

  const params = {
    TableName: 'Users',
    Item: { userId, username, password: hashedPassword },
  };

  try {
    await dynamoDb.send(new PutCommand(params));
    res.status(201).json({ message: 'Usuário registrado com sucesso!' });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({ error: 'Erro ao registrar usuário.' });
  }
};

// Função de login do usuário
exports.login = async (req, res) => {
  const { username, password } = req.body;

  const params = {
    TableName: 'Users',
    Key: { username },
  };

  try {
    const { Item: user } = await dynamoDb.send(new GetCommand(params));
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ token });
    } else {
      res.status(400).json({ error: 'Credenciais inválidas.' });
    }
  } catch (error) {
    console.error('Erro ao efetuar login.', error);
    res.status(500).json({ error: 'Erro ao efetuar login.' });
  }
};

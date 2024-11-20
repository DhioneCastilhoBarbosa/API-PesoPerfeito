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
  const { email, username, password} = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = uuidv4();
  const enabled = false;
  const params = {
    TableName: 'Users',
    Item: { userId, email,username, password: hashedPassword, enabled},
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
  const { email, password } = req.body;
  //console.log(email, password);
  const params = {
    TableName: 'Users',
    Key: { email },
  };

  try {
    const { Item: user } = await dynamoDb.send(new GetCommand(params));
    
    // Verificar se o usuário existe, a senha está correta e se está habilitado
    if (user && await bcrypt.compare(password, user.password)) {
      if (user.enabled) { // Apenas permita o login se 'enabled' for true
        const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, username: user.username });
      } else {
        res.status(403).json({ error: 'Usuário desativado. Entre em contato com o administrador.' });
      }
    } else {
      res.status(400).json({ error: 'Credenciais inválidas.' });
    }
  } catch (error) {
    console.error('Erro ao efetuar login.', error);
    res.status(500).json({ error: 'Erro ao efetuar login.' });
  }
};

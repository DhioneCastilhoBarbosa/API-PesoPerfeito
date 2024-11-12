const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Configuração do cliente DynamoDB v3
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDb = DynamoDBDocumentClient.from(client);

// Função para criar um novo ticket
exports.createTicket = async (req, res) => {
  const ticketId = uuidv4();
  const { cliente, produto, operador, placa, local, pesoBruto, pesoLiquido, tara } = req.body;
  const dataHora = new Date().toISOString();

  const params = {
    TableName: 'Tickets',
    Item: {
      ticketId,
      cliente,
      MTR: Math.floor(Math.random() * 100000),
      produto,
      operador,
      placa,
      dataHora,
      local,
      pesoBruto,
      pesoLiquido,
      tara,
    },
  };

  try {
    await dynamoDb.send(new PutCommand(params));
    res.status(201).json({ message: 'Ticket criado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar ticket.' });
  }
};

// Função para listar tickets com paginação
exports.getTickets = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const startKey = req.query.startKey ? JSON.parse(req.query.startKey) : null;

  const params = {
    TableName: 'Tickets',
    Limit: limit,
    ExclusiveStartKey: startKey,
  };

  try {
    const data = await dynamoDb.send(new ScanCommand(params));
    res.json({ items: data.Items, lastEvaluatedKey: data.LastEvaluatedKey });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar tickets.' });
  }
};

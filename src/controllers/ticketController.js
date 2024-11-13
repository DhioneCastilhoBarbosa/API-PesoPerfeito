const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
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
  
  // Verifica se `startKey` existe e é um JSON válido, caso contrário define como `null`
  const startKey = req.query.startKey ? JSON.parse(req.query.startKey) : null;
  
  const params = {
    TableName: 'Tickets',
    Limit: limit,
    ...(startKey && { ExclusiveStartKey: startKey }), // Adiciona `ExclusiveStartKey` somente se `startKey` existir
  };

  try {
    const data = await dynamoDb.send(new ScanCommand(params));
    res.json({ items: data.Items, lastEvaluatedKey: data.LastEvaluatedKey });
  } catch (error) {
    console.error('Erro ao buscar tickets.', error);
    res.status(500).json({ error: 'Erro ao buscar tickets.' });
  }
};

// Função para deletar um ticket
exports.deleteTicket = async (req, res) => {
  const { ticketId } = req.params;

  const params = {
    TableName: 'Tickets',
    Key: { ticketId },
  };

  try {
    await dynamoDb.send(new DeleteCommand(params));
    res.json({ message: 'Ticket deletado com sucesso!' });
  } catch (error) {
    console.error('Erro ao deletar ticket:', error);
    res.status(500).json({ error: 'Erro ao deletar ticket.' });
  }
};

// Função para atualizar um ticket

// Função para atualizar um ticket
exports.updateTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { cliente, produto, operador, placa, local, pesoBruto, pesoLiquido, tara } = req.body;

  const params = {
    TableName: 'Tickets',
    Key: { ticketId },
    UpdateExpression: 'set cliente = :cliente, produto = :produto, operador = :operador, placa = :placa, #localAttr = :local, pesoBruto = :pesoBruto, pesoLiquido = :pesoLiquido, tara = :tara',
    ExpressionAttributeNames: {
      '#localAttr': 'local', // Usando um alias para "local"
    },
    ExpressionAttributeValues: {
      ':cliente': cliente,
      ':produto': produto,
      ':operador': operador,
      ':placa': placa,
      ':local': local,
      ':pesoBruto': pesoBruto,
      ':pesoLiquido': pesoLiquido,
      ':tara': tara,
    },
    ReturnValues: 'UPDATED_NEW',
  };

  try {
    const data = await dynamoDb.send(new UpdateCommand(params));
    res.json({ message: 'Ticket atualizado com sucesso!', updatedAttributes: data.Attributes });
  } catch (error) {
    console.error('Erro ao atualizar ticket:', error);
    res.status(500).json({ error: 'Erro ao atualizar ticket.' });
  }
};
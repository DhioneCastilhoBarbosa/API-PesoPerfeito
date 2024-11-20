const { DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand,QueryCommand,UpdateCommand, DeleteCommand,GetCommand} = require('@aws-sdk/lib-dynamodb');

const { v4: uuidv4 } = require('uuid');

// Configuração do cliente DynamoDB v3
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.getTicketsByClientName = async (req, res) => {
  const clientName = req.query.clientName;
  const ticketID = req.query.ticketID; // Parâmetro ticketID opcional
  const startDate = req.query.startDate; // Data inicial
  let endDate = req.query.endDate; // Data final

  // Função para validar o formato das datas
  const isValidDate = (date) => !isNaN(Date.parse(date));

  // Validações
  if (!clientName && !ticketID) {
    return res.status(400).json({ error: 'Pelo menos um dos parâmetros clientName ou ticketID é obrigatório.' });
  }

  if (startDate && !isValidDate(startDate)) {
    return res.status(400).json({ error: 'O parâmetro startDate é inválido. Use o formato YYYY-MM-DD.' });
  }

  if (endDate && !isValidDate(endDate)) {
    return res.status(400).json({ error: 'O parâmetro endDate é inválido. Use o formato YYYY-MM-DD.' });
  }

  // Ajusta a data final para incluir o último segundo do dia
  if (endDate) {
    const endDateObject = new Date(endDate);
    endDateObject.setHours(23, 59, 59, 999); // Define 23:59:59.999 no horário final
    endDate = endDateObject.toISOString(); // Converte para formato ISO
  }

  // Configuração inicial do Scan
  const filterExpression = [];  // Inicializando como array
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  // Filtro para clientName (case insensitive)
  if (clientName) {
    filterExpression.push('contains(#cliente, :cliente)'); // Usar '=' para correspondência exata
    expressionAttributeNames['#cliente'] = 'cliente';
    expressionAttributeValues[':cliente'] = clientName; // Garantir comparação sem diferenciar maiúsculas/minúsculas
  }

  // Filtro para ticketID
  if (ticketID) {
    filterExpression.push('#ticketID = :ticketID');
    expressionAttributeNames['#ticketID'] = 'ticketID';
    expressionAttributeValues[':ticketID'] = ticketID;
  }

  // Adiciona filtros para datas, se fornecidos
  if (startDate || endDate) {
    const dateFilter = [];

    if (startDate) {
      dateFilter.push('#dataHora = :startDate');
      expressionAttributeNames['#dataHora'] = 'dataHora';
      expressionAttributeValues[':startDate'] = startDate;
    }

    if (endDate) {
      dateFilter.push('#dataHora = :endDate');
      expressionAttributeNames['#dataHora'] = 'dataHora';
      expressionAttributeValues[':endDate'] = endDate;
    }

    if (startDate && endDate && startDate !== endDate) {
      dateFilter.push('#dataHora BETWEEN :startDate AND :endDate');
    }

    if (dateFilter.length > 0) {
      filterExpression.push(`(${dateFilter.join(' OR ')})`);
    }
  }

  // Juntando todas as partes do filtro
  const finalFilterExpression = filterExpression.join(' AND ');

  
  const scanParams = {
    TableName: 'Tickets',
    FilterExpression: finalFilterExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  let allItems = [];
  let lastEvaluatedKey = null;

  try {
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const data = await dynamoDb.send(new ScanCommand(scanParams));
      allItems = allItems.concat(data.Items);
      lastEvaluatedKey = data.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    res.json({ items: allItems });
  } catch (error) {
    console.error('Erro ao buscar tickets:', error);
    res.status(500).json({ error: 'Erro ao buscar tickets.' });
  }
};



// Função para criar um novo ticket
exports.createTicket = async (req, res) => {
  const ticketId = uuidv4();
  const dataHora = new Date().toISOString();
  const { cliente, produto, operador, placa, local, pesoBruto, pesoLiquido, tara } = req.body;

  const ticketParams = {
    TableName: 'Tickets',
    Item: {
      ticketId,
      dataHora,
      cliente,
      MTR: Math.floor(Math.random() * 100000),
      produto,
      operador,
      placa,
      local,
      pesoBruto,
      pesoLiquido,
      tara,
      allTickets: 'allTickets', // Adiciona o atributo fixo
    },
  };

  const updateAggregationParams = {
    TableName: 'Aggregations',
    Key: { aggregationId: 'totalWeights' }, // ID único para as agregações de peso
    UpdateExpression: 'SET totalPesoBruto = if_not_exists(totalPesoBruto, :zero) + :pesoBruto, totalPesoLiquido = if_not_exists(totalPesoLiquido, :zero) + :pesoLiquido',
    ExpressionAttributeValues: {
      ':pesoBruto': pesoBruto || 0, // Evitar valores `undefined`
      ':pesoLiquido': pesoLiquido || 0,
      ':zero': 0, // Valor inicial para os atributos agregados
    },
    ReturnValues: 'UPDATED_NEW',
  };

  try {
    // Criar o ticket
    await dynamoDb.send(new PutCommand(ticketParams));

    // Atualizar as agregações de peso
    await dynamoDb.send(new UpdateCommand(updateAggregationParams));

    res.status(201).json({ message: 'Ticket criado com sucesso!' });
  } catch (error) {
    console.error('Erro ao criar ticket:', error);
    res.status(500).json({ error: 'Erro ao criar ticket.' });
  }
};


// Função para listar tickets com paginação

/*exports.getTickets = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  // Decodificar e validar o `lastEvaluatedKey` da query string
  let lastEvaluatedKey = null;
  if (req.query.lastEvaluatedKey) {
    try {
      lastEvaluatedKey = JSON.parse(decodeURIComponent(req.query.lastEvaluatedKey));
    } catch (error) {
      return res.status(400).json({ error: 'lastEvaluatedKey inválido. Deve ser um JSON válido.' });
    }
  }

  const queryParams = {
    TableName: 'Tickets',
    IndexName: 'allTickets-dataHora-index', // Nome do GSI
    KeyConditionExpression: 'allTickets = :allTickets', // Filtro pela chave de partição
    ExpressionAttributeValues: {
      ':allTickets': 'allTickets', // Valor fixo para consultar todos os tickets
    },
    ScanIndexForward: false, // Ordenar do mais recente para o mais antigo
    Limit: limit, // Número de itens a retornar
    ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }), // Paginação
  };

  const countParams = {
    TableName: 'Tickets',
    IndexName: 'allTickets-dataHora-index', // Nome do GSI
    Select: 'COUNT', // Apenas conta os itens
    KeyConditionExpression: 'allTickets = :allTickets',
    ExpressionAttributeValues: {
      ':allTickets': 'allTickets',
    },
  };

  try {
    // Consulta principal para obter itens e lastEvaluatedKey
    const data = await dynamoDb.send(new QueryCommand(queryParams));

    // Consulta adicional para obter o total de itens no índice
    const totalData = await dynamoDb.send(new QueryCommand(countParams));

    res.json({
      items: data.Items, // Lista de itens retornados
      lastEvaluatedKey: data.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(data.LastEvaluatedKey))
        : null, // Codificar o lastEvaluatedKey para evitar problemas de formatação
      totalItems: totalData.Count, // Total de itens no índice
    });
  } catch (error) {
    console.error('Erro ao buscar tickets:', error);
    res.status(500).json({ error: 'Erro ao buscar tickets.' });
  }
};*/

exports.getTickets = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  // Decodificar e validar o `lastEvaluatedKey` da query string
  let lastEvaluatedKey = null;
  if (req.query.lastEvaluatedKey) {
    try {
      lastEvaluatedKey = JSON.parse(decodeURIComponent(req.query.lastEvaluatedKey));
    } catch (error) {
      return res.status(400).json({ error: 'lastEvaluatedKey inválido. Deve ser um JSON válido.' });
    }
  }

  const queryParams = {
    TableName: 'Tickets',
    IndexName: 'allTickets-dataHora-index', // Nome do GSI
    KeyConditionExpression: 'allTickets = :allTickets', // Filtro pela chave de partição
    ExpressionAttributeValues: {
      ':allTickets': 'allTickets', // Valor fixo para consultar todos os tickets
    },
    ScanIndexForward: false, // Ordenar do mais recente para o mais antigo
    Limit: limit, // Número de itens a retornar
    ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }), // Paginação
  };

  const countParams = {
    TableName: 'Tickets',
    IndexName: 'allTickets-dataHora-index', // Nome do GSI
    Select: 'COUNT', // Apenas conta os itens
    KeyConditionExpression: 'allTickets = :allTickets',
    ExpressionAttributeValues: {
      ':allTickets': 'allTickets',
    },
  };

  const aggregationParams = {
    TableName: 'Aggregations',
    Key: { aggregationId: 'totalWeights' }, // Identificador único da agregação
  };

  try {
    // Consulta principal para obter itens e lastEvaluatedKey
    const data = await dynamoDb.send(new QueryCommand(queryParams));

    // Consulta adicional para obter o total de itens no índice
    const totalData = await dynamoDb.send(new QueryCommand(countParams));

    // Consulta adicional para obter os totais agregados
    const aggregationData = await dynamoDb.send(new GetCommand(aggregationParams));
    const { totalPesoBruto, totalPesoLiquido } = aggregationData.Item || {};

    res.json({
      items: data.Items, // Lista de itens retornados
      lastEvaluatedKey: data.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(data.LastEvaluatedKey))
        : null, // Codificar o lastEvaluatedKey para evitar problemas de formatação
      totalItems: totalData.Count, // Total de itens no índice
      totalPesoBruto: totalPesoBruto || 0, // Valor agregado do peso bruto
      totalPesoLiquido: totalPesoLiquido || 0, // Valor agregado do peso líquido
    });
  } catch (error) {
    console.error('Erro ao buscar tickets:', error);
    res.status(500).json({ error: 'Erro ao buscar tickets.' });
  }
};



exports.deleteTicket = async (req, res) => {
  const { ticketId } = req.params;

  // Consulta para obter a dataHora associada ao ticketId
  const queryParams = {
    TableName: 'Tickets',
    KeyConditionExpression: 'ticketId = :ticketId',
    ExpressionAttributeValues: {
      ':ticketId': ticketId,
    },
  };

  try {
    // Obter a dataHora associada ao ticketId
    const result = await dynamoDb.send(new QueryCommand(queryParams));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ error: 'Ticket não encontrado.' });
    }

    const { dataHora } = result.Items[0]; // Obtém a dataHora associada ao ticketId

    const deleteParams = {
      TableName: 'Tickets',
      Key: {
        ticketId,  // Partition Key
        dataHora,  // Sort Key
      },
    };

    // Deletando o ticket
    await dynamoDb.send(new DeleteCommand(deleteParams));
    res.json({ message: 'Ticket deletado com sucesso!' });
  } catch (error) {
    console.error('Erro ao deletar ticket:', error);
    res.status(500).json({ error: 'Erro ao deletar ticket.' });
  }
};




// Função para atualizar um ticket
exports.updateTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { cliente, produto, operador, placa, local, pesoBruto, pesoLiquido, tara } = req.body;

  // Consulta para obter a dataHora associada ao ticketId
  const queryParams = {
    TableName: 'Tickets',
    KeyConditionExpression: 'ticketId = :ticketId',
    ExpressionAttributeValues: {
      ':ticketId': ticketId,
    },
  };

  try {
    // Obter a dataHora associada ao ticketId
    const result = await dynamoDb.send(new QueryCommand(queryParams));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ error: 'Ticket não encontrado.' });
    }

    const { dataHora } = result.Items[0]; // Obtém a dataHora associada ao ticketId

    const updateParams = {
      TableName: 'Tickets',
      Key: {
        ticketId,  // Partition Key
        dataHora,  // Sort Key
      },
      UpdateExpression: `
        set cliente = :cliente,
            produto = :produto,
            operador = :operador,
            placa = :placa,
            #localAttr = :local,
            pesoBruto = :pesoBruto,
            pesoLiquido = :pesoLiquido,
            tara = :tara
      `,
      ExpressionAttributeNames: {
        '#localAttr': 'local', // Alias para a coluna reservada "local"
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

    // Atualizando o ticket
    const data = await dynamoDb.send(new UpdateCommand(updateParams));
    res.json({ message: 'Ticket atualizado com sucesso!', updatedAttributes: data.Attributes });
  } catch (error) {
    console.error('Erro ao atualizar ticket:', error);
    res.status(500).json({ error: 'Erro ao atualizar ticket.' });
  }
};

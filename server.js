var io = require('socket.io').listen(443);
io.enable('browser client minification');
io.enable('browser client etag');
io.enable('browser client gzip');
io.set('log level', 1);
io.set('transports', ['websocket']);//, 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);

var currentGames = {};
var maxPlayers = 8;

// Bind listeners
io.sockets.on('connection', socket => {
  log('New connection from ' + socket.handshake.address.address + ' on socket ' + socket.id);

  socket.on('new-viewer', data => {
    assignNewViewer(socket, data.viewerId, data.gameRoom);
  });

  socket.on('new-player', data => {
    assignNewPlayer(socket, data.playerId, data.gameRoom, data.playerIcon, data.playerName);
  });

  // Controller broadcasting user-input to viewer
  socket.on('player-update', data => {
    //log('Player-update: ' + JSON.stringify(data));

    // Verify if gameRoom exists
    if (!verifyGameRoom(data.gr)) {
      log('Player-update: kickPlayer');
      kickClient(socket);
      return false;
    }

    // Check if player is joined in gameRoom
    if (currentGames[data.gr].players[socket.id].playerId != data.pid) {
      kickClient(socket);
      return false;
    }

    // Emit player-update to viewer
    io.sockets.socket(currentGames[data.gr].viewer).emit('player-update', data);
  });

  socket.on('update-score', data => {
    //log('Update-score: ' + JSON.stringify(data));

    // Verify if this viewer is authorative for this gameRoom and that is exists
    if (!verifyGameRoom(data.gameRoom, data.viewerId)) {
      log('Update-score: kickPlayer');
      kickClient(socket);
      return false;
    }

    // Lookup player and emit update-score
    for (var ii in currentGames[data.gameRoom].players) {
      if (currentGames[data.gameRoom].players[ii].playerId == data.playerId) {
        currentGames[data.gameRoom].players[ii].score = data.score;
        io.sockets.socket(ii).emit('update-score', data);
      }
    }
  });

  socket.on('update-player-color', data => {
    //log('Update-player-color: ' + JSON.stringify(data));

    // Verify if this viewer is authorative for this gameRoom and that is exists
    if (!verifyGameRoom(data.gameRoom, data.viewerId)) {
      log('Update-player-color: kickPlayer');
      kickClient(socket);
      return false;
    }

    // Lookup player and emit update-score
    for (var ii in currentGames[data.gameRoom].players) {
        if (currentGames[data.gameRoom].players[ii].playerId == data.playerId) {
          io.sockets.socket(ii).emit('update-player-color', data);
        }
    }
  });

  socket.on('game-start', data => {
    log('Game-start: ' + JSON.stringify(data));

    // Verify if this viewer is authorative for this gameRoom and that is exists
    if (!verifyGameRoom(data.gameRoom, data.viewerId)) {
      log('Game-start: kickPlayer');
      kickClient(socket);
      return false;
    }

    currentGames[data.gameRoom].started = true;

    // Emit game-start to all joined players
    socket.broadcast.to('room-' + data.gameRoom).emit('game-start');
  });

  socket.on('game-get-ready', data => {
    log('Game-get-ready: ' + JSON.stringify(data));

    // Verify if this viewer is authorative for this gameRoom and that is exists
    if (!verifyGameRoom(data.gameRoom, data.viewerId)) {
      log('Game-get-ready: kickPlayer');
      kickClient(socket);
      return false;
    }

    // Emit game-get-ready to all joined players
    socket.broadcast.to('room-' + data.gameRoom).emit('game-get-ready');
  });


  socket.on('game-end', data => {
    log('Game-end: ' + JSON.stringify(data));

    // Verify if this viewer is authorative for this gameRoom and that is exists
    if (!verifyGameRoom(data.gameRoom, data.viewerId)) {
      log('Game-end: kickPlayer');
      kickClient(socket);
      return false;
    }

    for (var ii in currentGames[data.gameRoom].players) {

      // This is where the winner is calculated and we send off the results to smart contract

      // Emit Game-end to players
      io.sockets.socket(ii).emit('game-end', {
        highScore: highScore
      });
    }
  });

  socket.on('game-reset', data => {
    log('Game-reset: ' + JSON.stringify(data));

    // Verify if this viewer is authorative for this gameRoom and that is exists
    if (!verifyGameRoom(data.gameRoom, data.viewerId)) {
      log('Game-reset: kickPlayer');
      kickClient(socket);
      return false;
    }

    // Unjoin players and make them leave the room
    for (var ii in currentGames[data.gameRoom].players) {
      io.sockets.socket(ii).emit('game-reset');
      io.sockets.socket(ii).leave('room-' + data.gameRoom);
    }
    currentGames[data.gameRoom].players = {};

    // Unstart game
    currentGames[data.gameRoom].started = false;
  });

  socket.on('disconnect', () => {
    // if viewer disconnects, delete game and emit game-invalid
    var isViewer = false;
    for (var ii in currentGames) {
      if (currentGames[ii].viewer == socket.id) {
        isViewer = true;
        log('Viewer on socket ' + socket.id + ' disconnected');
        socket.broadcast.to('room-' + ii).emit('game-invalid');
        delete currentGames[ii];
      }
    }

    // if player disconnects, delete player and emit game-reset
    if (!isViewer) {
      log('Player on socket ' + socket.id + ' disconnected');

      var gameRoom = false;
      for (var ii in currentGames) {
        for (var oo in currentGames[ii].players) {
          if (oo == socket.id) {
            gameRoom = ii;
            delete currentGames[ii].players[oo];
          }
        }
      }

      if (gameRoom) {
        var playerCount = 0;
        for (var ii in currentGames[gameRoom].players) {
          playerCount++;
        }
        if (playerCount < 1) {
          socket.broadcast.to('room-' + gameRoom).emit('game-end');
        } else {
          // Emit updated gameState to viewer
          io.sockets.socket(currentGames[gameRoom].viewer).emit('update-game-state', currentGames[gameRoom]);
        }
      }
    }
  });
});


function assignNewViewer(socket, viewerId, gameRoom) {
  log('Viewer identified as ' + socket.id + ' using viewerId ' + viewerId + ' and gameRoom ' + gameRoom);

  // Create gameRoom if it doesn't exist
  if (verifyGameRoom(gameRoom)) {
    if (viewerId != currentGames[gameRoom].viewerId) {
      log('AssignNewViewer: kickPlayer');
      kickClient(socket);
      return false;
    }
  } else {
    currentGames[gameRoom] = {
      viewerId: viewerId,
      gameRoom: gameRoom
    };
  }

  // New viewer in game state
  currentGames[gameRoom].viewer = socket.id;

  // Unjoin all players and clear players
  currentGames[gameRoom].players = {};

  // Game not yet started
  currentGames[gameRoom].started = false;

  // Add viewer to gameRoom
  socket.join('room-' + gameRoom);

  // Emit reset-game to players/viewer
  socket.broadcast.to('room-' + gameRoom).emit('game-reset');

  // Emit updated gameState to viewer
  io.sockets.socket(socket.id).emit('update-game-state', currentGames[gameRoom]);
}

function verifyGameRoom(gameRoom, viewerId) {
  // Check if gameRoom exists
  if (isNaN(gameRoom) || gameRoom < 10000 || gameRoom > 99999) {
    return false;
  }
  if (typeof currentGames[gameRoom] == 'undefined') {
    return false;
  }

  // If supplied, check if viewerId is autorative for this gameRoom
  if (typeof viewerId != 'undefined') {
    if (currentGames[gameRoom].viewerId != viewerId) {
      return false;
    }
  }

  return true;
}

function kickClient(socket) {
  log('Client kicked ' + socket.id);
  io.sockets.socket(socket.id).emit('game-invalid');
  socket.disconnect();
}

function log(logline) {
  console.log('[' + new Date().toUTCString() + '] ' + logline);
}

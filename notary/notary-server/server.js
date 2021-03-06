var blockchainManager = require('./database/blockchain.js');

var express = require('express');
var CryptoJS = require('crypto-js');
var bodyParser = require('body-parser');
var WebSocket = require('ws');

const MessageType = {
    FETCH_BLOCKCHAIN: 0,
    RESPONSE_BLOCKCHAIN: 1,
    ADD_BLOCK: 2,
    VERIFY_ATTENDANCE: 3,
    RESPONSE_VERIFICATION: 4
};

const Result = {
    CONFIRMED: "confirmed",
    DENIED: "denied"
}

var http_port = 3000;
var ws_port = 5000;
var socketPeers = [];
var blockchain;
var rootDB;

var initP2PServer = () => {
    wss = new WebSocket.Server({port: ws_port});    
    wss.on('connection', ws => initConnection(ws));
    wss.on('error', () => {
        log("ws connection error")
        socketPeers.splice(socketPeers.indexOf(ws), 1);
    });
    log('WS Server listening on port: ' + ws_port);
}

var retrieveData = () => {
    blockchainManager.retrieveExistingBlockchain().then(result => {
        blockchain = JSON.parse(JSON.stringify(result));
    })

    blockchainManager.retrieveRootDB().then(result => {
        rootDB = JSON.parse(JSON.stringify(result));
        rootMap = new Map();
        initRootMap();
    })
}

var initConnection = (ws) => {
    log('New Connection');
    socketPeers.push(ws);
    log("Number of peers: "+ socketPeers.length)
    ws.on('message', message => messageHandler(ws, message));
    ws.on('close', () => {
        log('Close connection');
        socketPeers.splice(socketPeers.indexOf(ws), 1);
        log('Number of peers: '+ socketPeers.length)
    });
}

var initRootMap = () => {
    for(let record of rootDB) {
        rootMap.set(record.sessionId, record.blockIndex)
    }
}

var addToRootMap = (sessionId, blockIndex) => {
    rootMap.set(sessionId, blockIndex)
    blockchainManager.pushRootItem({sessionId: sessionId, blockIndex: blockIndex})
}

var messageHandler = (ws, data) => {
    var message = JSON.parse(data)

    switch(message.type) {
        case MessageType.FETCH_BLOCKCHAIN:
            send(ws, responseBlockchainMsg());
            break;
        case MessageType.RESPONSE_BLOCKCHAIN:
            handleBlockchain(message.data);
            break;
        case MessageType.ADD_BLOCK:
            handleBlock(message.data)
            break;
        case MessageType.VERIFY_ATTENDANCE:
            handleVerification(message.data)
            break;
        case MessageType.RESPONSE_VERIFICATION:
            handleVerificationResponse(message.data)
            break;
    }
};

var fetchBlockchainMsg = () => ({
    'type': MessageType.FETCH_BLOCKCHAIN
})

var responseBlockchainMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': blockchain
});

var addBlockMsg = (sessionId) => ({
    'type': MessageType.ADD_BLOCK,
    'data': ({
        'sessionId': sessionId, 
        'block': getLatestBlock()
    })
})

var verifyAttendanceMsg = (sessionId, attendance) => ({
    'type': MessageType.VERIFY_ATTENDANCE,
    'data': ({
        'sessionId': sessionId,
        'attendance': attendance
    })
})

var responseVerificationMsg = (sessionId, attendance, result) => ({
    'type': MessageType.RESPONSE_VERIFICATION,
    'data': ({
        'sessionId': sessionId,
        'attendance': attendance,
        'result': result
    })
})

var responseVerificationResultMsg = (result) => ({
    'result': result
})

var fetchBlockchain = () => {
    log("fetch blockchain")
    if(socketPeers.length > 0)
        send(socketPeers[0], fetchBlockchainMsg());
    else log('no peers available')
}

var handleBlockchain = (data) => {
    log("handle new blockchain")
    blockchain = JSON.parse(JSON.stringify(data)).sort((b1, b2) => (b1.index - b2.index));
}

var handleBlock = (data) => {
    log("handle block");
    var parsedData = JSON.parse(JSON.stringify(data));
    var sessionId = parsedData.sessionId;
    var nextBlock = parsedData.block;
    log("RECEIVED BLOCK" + JSON.stringify(nextBlock))

    if(isNextBlockValid(nextBlock, getLatestBlock())) {
        addBlock(sessionId, nextBlock);
    } else {
        send(socketPeers[0], fetchBlockchainMsg())
    }
}

var handleVerification = (data) => {
    log("handle verification")
    var parsedData = JSON.parse(JSON.stringify(data));
    var result = verifyAttendance(parsedData.sessionId, parsedData.attendance);
    send(socketPeers[0], responseVerificationMsg(parsedData.sessionId, parsedData.attendance, result));
}

var handleVerificationResponse = (data) => {
    log("handle verification response")
    var parsedData = JSON.parse(JSON.stringify(data));
    var sessionId = parsedData.sessionId;
    var attendance = parsedData.attendance;
    var result = parsedData.result;
    var numberOfPeers = socketPeers.length;

    if(!attendanceClaimsMap.get(attendance)) {
        attendanceClaimsMap.set(attendance, [])
    }
    attendanceClaimsMap.get(attendance).push(result);

    if(attendanceClaimsMap.get(attendance).length == numberOfPeers){
        if(majorityConfirm(attendance)){
            attendanceResponsesMap.get(attendance).send(responseVerificationResultMsg(Result.CONFIRMED));
            attendanceResponsesMap.delete(attendance);
            attendanceClaimsMap.delete(attendance);
        } else {
            attendanceResponsesMap.forEach((key, value) => {
                log(key + " = " + value)
                log(attendance)
            })
            attendanceResponsesMap.get(attendance).send(responseVerificationResultMsg(Result.DENIED));
            attendanceResponsesMap.delete(attendance);
            attendanceClaimsMap.delete(attendance);
        }
    } else {
        log("waiting for others. Current number of responses: " + attendanceClaimsMap.get(attendance).length);
    }
}

var majorityConfirm = (attendance) => {
    log("Majority confirmation")
    var numberOfConfirmations = 0;
    var allResults = attendanceClaimsMap.get(attendance);

    allResults.forEach(result => {
        if(result) numberOfConfirmations++;
    })
    if(numberOfConfirmations > (allResults.length / 2))
        return true;

    return false;
}

var broadcast = (message) => {
    log("broadcast")
    socketPeers.forEach(socket => {
        send(socket, message);
    })
}

var connectToPeers = (peers) => {
    peers.forEach(peer => {
        ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            log("ws connection error")
            socketPeers.splice(socketPeers.indexOf(ws), 1);
        });
    });
}

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
      });

    app.post('/addAttendance', function(req, res) {
        // we get hash = e  = sha256(studentId, sessionId) and sessionId
        var sessionId = req.body.sessionId;
        log("Add attendance session: " + sessionId);
        var attendance = req.body.attendance;
        log("Add attendance attendance: " + attendance);


        if(!attendanceQueue.get(sessionId)) {
            res.json({"result": "Session " + sessionId + " does not exist!"});
            return;
        } else {
            attendanceQueue.get(sessionId).push(attendance);
        }

        log(attendanceQueue.get(sessionId).length)

        res.json({"result": "OK"})
    });
    
    app.post('/addSession', function(req, res){
        if(req.body.state == null || req.body.state == '' ||
           req.body.sessionId == null || req.body.sessionId == '') {
            res.json({"result": "Bad request!"});
            return;
        }
        var sessionId = String(req.body.sessionId);
        log("sessionId: " + sessionId)
        log("state " + req.body.state);

        switch (req.body.state) {
            case 'begin':
                log('begin');
                // check wheather someone tries to add attendance to already existing session
                if(blockId = rootMap.get(sessionId)) {
                    if(blockId <= getLatestBlock().index) {
                        res.json({"result": "Block for session " + sessionId + " already exists!"});
                        return;
                    }
                }
                if(attendanceQueue.get(sessionId)) {
                    res.json({"result": "Session " + sessionId + " already began!"});                    
                } else {
                    attendanceQueue.set(sessionId, []);
                    res.json({"result": "OK"})
                }
                break;
            case 'end':
                log('end');
                if(attendances = attendanceQueue.get(sessionId)) {
                    addBlock(sessionId, createNextBlock(attendances));
                    broadcast(addBlockMsg(sessionId));
                    attendanceQueue.delete(sessionId);                    
                }
                res.json({"result": "OK"})
                break;
            default:
                res.json({"result": "Bad request"});    
        }
    });

    app.get('/verifyAttendance', function(req, res){
        verifyAttendanceMaster(String(req.query.sessionId), req.query.attendance, res)
    });

    app.get('/', function(req, res) {
        res.json({"result": "Notary blockchain"})
    });

    app.post('/reset', function(req, res) {
        blockchainManager.reset().then(() => {
            retrieveData();
            res.send({"result": "Notary resetted"})
        })
    })

    app.listen(http_port, function () {
        log('HTTP Server listening on port: ' + http_port);
    });
}

class Block {
    constructor(index, attendances, prevHash, timestamp, hash) {
        this.index = index;
        this.attendances = attendances;
        this.prevHash = prevHash;
        this.timestamp = timestamp;
        this.hash = hash;
    }
}

var verifyAttendanceMaster = (sessionId, attendance, res) => {
    log("verify attendance master")
    if(!rootMap.get(sessionId)){
        res.json({"result": "No sessionId: " + sessionId + " found."});
        return false;
    }
    var blockIndex = rootMap.get(sessionId);
    var block = blockchain[blockIndex];

    if(findAttendanceInBlock(attendance, block)){
        res.json(responseVerificationResultMsg(Result.CONFIRMED));
    } else {
        if(socketPeers.length == 0) {
            log("no peers")
            res.json(responseVerificationResultMsg(Result.DENIED))
        } else {
            log("ASK OTHERS");
            attendanceResponsesMap.set(attendance, res);
            broadcast(verifyAttendanceMsg(sessionId, attendance));
            // set timeout of 5s in cases when some of 
            // the connected peers do not respond due to connection problems
            setTimeout(() => {
                if(!attendanceClaimsMap.get(attendance)) {
                    if(attendanceResponsesMap.get(attendance)) {
                        attendanceResponsesMap.get(attendance).send(responseVerificationResultMsg(Result.DENIED));
                        attendanceResponsesMap.delete(attendance);
                    }
                } 
            }, 5000)
        }
    }

}

var verifyAttendance = (sessionId, attendance) => {
    log("verify node");
    if(!rootMap.get(sessionId)) return false;
    var blockIndex = rootMap.get(sessionId);
    var block = blockchain[blockIndex];
    
    if(findAttendanceInBlock(attendance, block)){
        return true;
    } else {
        return false;
    }
}

var findAttendanceInBlock = (attendance, block) => {
    log("Verify attendance in block")
    var found = block.attendances.find(att => {
        return att == attendance
    });
    if(found) return true;

    return false;
}

var calculateHash = (index, attendances, prevHash, timestamp) => {
    log("calculate hash")
    return CryptoJS.SHA256(index + attendances + prevHash + timestamp).toString();
};

var getGenesisBlock = () => {
    return new Block(0, "genesis", "0", 1516459421,
                    calculateHash(0, "genesis", "0", 1516459421))
}

var calculateHashForBlock = (block) => {
    log("calculate hash for block")
    return calculateHash(block.index, block.attendances, block.prevHash, block.timestamp);
}; 

var getLatestBlock = () => {
    log("get latest block")
    return blockchain[blockchain.length - 1];
}

var createNextBlock = (attendances) => {
    log("create next block")
    var previousBlock = getLatestBlock();

    var nextIndex = previousBlock.index + 1;
    var prevHash = previousBlock.hash;
    var nextTimestamp = Math.floor(Date.now() / 1000);
    var nextHash = calculateHash(nextIndex, attendances, prevHash, nextTimestamp);

    return new Block(nextIndex, attendances, prevHash, nextTimestamp, nextHash);
}

var addBlock = (sessionId, block) => {
    log("add block")
    blockchain.push(block);
    blockchainManager.pushBlock(block);
    addToRootMap(sessionId, block.index);
    log("Blockchain size: " + blockchain.length);
}

var isNextBlockValid = (nextBlock, prevBlock) => {
    if(prevBlock.index + 1 !== nextBlock.index) {
        log("Wrong index");
        return false;
    }
    if(nextBlock.prevHash !== prevBlock.hash) {
        log('Wrong prevHash of nextBlock');
        return false;
    }
    if(nextBlock.hash !== calculateHashForBlock(nextBlock)) {
        log("Wrong hash of nextBlock");
        log("Existing hash: " + nextBlock.hash);
        log("calculated hash" + calculateHashForBlock(nextBlock));
        return false;
    }
    return true;
}

var send = (ws, data) => {
    log("send data")
    try {
        ws.send(JSON.stringify(data));
    }
    catch(error) {
        log("Error: " + error)
        socketPeers.splice(socketPeers.indexOf(ws), 1);
    }
    
}

var log = (data) =>{
    console.log(Date(Date.now()) +": " + data.charAt(0).toUpperCase() + data.slice(1));
}

var rootMap = new Map();
var attendanceQueue = new Map();
var attendanceClaimsMap = new Map();
var attendanceResponsesMap = new Map();

initHttpServer();
initP2PServer();

retrieveData(); // get an already existing blockchain

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    log("Uncaught exception");
});

require('dotenv').config();
var GameController = require('./GameController');
var _ = require('lodash');
var https = require('https');
var fs = require('fs');


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit/lib/Botkit.js');
var os = require('os');

var bots = {};
function trackBot(bot) {
    bots[bot.team_info.id] = bot;
}

var controller = Botkit.slackbot({
    debug: true,
    json_file_store: 'storage/db.json'
});

controller.configureSlackApp({
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    redirectUri: 'https://themission.biz:' + process.env.httpsPort,
    scopes: ['team:read','users:read','channels:read','im:open','im:write','chat:write:bot','bot']
});

controller.setupWebserver(process.env.httpPort,function(err,express_webserver) {
    var httpsOptions = {
        key: fs.readFileSync( 'ssl/privatekey.key' ),
        cert: fs.readFileSync( 'ssl/certificate.crt' ),
        ca: [
            fs.readFileSync( 'ssl/certificate.ca-bundle-1' ),
            fs.readFileSync( 'ssl/certificate.ca-bundle-2' )
        ]
    };
    https.createServer(httpsOptions, express_webserver).listen(process.env.httpsPort, function(){
        controller.createOauthEndpoints(controller.webserver, function(err,req,res) {
            if (err) {res.status(500).send('ERROR: ' + err);}
            else {res.send('Success!');}
        });
        controller.createWebhookEndpoints(express_webserver);
    });
});

controller.on('create_bot',function(bot,config) {
    if (bots[bot.team_info.id]) {
        // already online! do nothing.
    } else {
        bot.startRTM(function(err) {
            if (!err) {
                trackBot(bot);
            }
        });
    }
});

controller.on('slash_command',function(commandBot,message) {
    var gameBot = bots[bot.team_info.id];
    GameController.loadOrCreate(controller.storage, commandBot, gameBot, message.team_id, '#ack', function(gameController){

        var text = message.text.trim().toLowerCase().split(/ +/);

        if ( !text ) {
            return;
        }

        gameController.handlePlayerAction(message.user, text, message);
    });
});

controller.storage.teams.all(function(err,teams) {
    if (err) {
        throw new Error(err);
    }

    // connect all teams with bots up to slack!
    for (var t in teams) {
        if (teams[t].bot) {
            controller.spawn(teams[t]).startRTM(function(err, bot) {
                if (err) {
                    console.log('Error connecting bot to Slack:',err);
                } else {
                    trackBot(bot);
                }
            });
        }
    }

});

GameController.startTickers(controller.storage, bots, '#ack');




//
//var channelId;
//bot.api.channels.list({}, function (err, response) {
//    for (var i = 0; i < response.channels.length; i++) {
//        var channel = response.channels[i];
//        if ( channel.name == 'ack' ) {
//            channelId = channel.id;
//        }
//    }
//});

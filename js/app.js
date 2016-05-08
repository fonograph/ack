var GameController = require('./GameController');
var _ = require('lodash');

if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit/lib/Botkit.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
    json_file_store: 'storage/db.json'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

bot.api.team.info({}, function(err, response){
    controller.storage.teams.get(response.team.id, function(err, teamData){
        teamData = teamData || {};
        teamData.id = response.team.id;
        controller.storage.teams.save(teamData);
    })
});

var channelId;
bot.api.channels.list({}, function (err, response) {
    for (var i = 0; i < response.channels.length; i++) {
        var channel = response.channels[i];
        if ( channel.name == 'ack' ) {
            channelId = channel.id;
        }
    }
});

controller.setupWebserver(process.env.port,function(err,express_webserver) {
    controller.createWebhookEndpoints(express_webserver)
});

controller.on('slash_command',function(commandBot,message) {
    GameController.loadOrCreate(controller.storage, commandBot, bot, message.team_id, channelId, function(gameController){

        var text = message.text.trim().toLowerCase().split(/ +/);

        if ( !text ) {
            return;
        }

        gameController.handlePlayerAction(message.user, text, message);

        //bot.replyPublic(message, message.text);
        //bot.replyPublic(message,'Everyone can see this part of the slash command');
        //bot.replyPrivate(message,'Only the person who used the slash command can see this.');
    });


});

controller.on('outgoing_webhook',function(bot,message) {
    // reply to outgoing webhook command
    //bot.replyPublic(message,'Everyone can see the results of this webhook command');
});
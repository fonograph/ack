var Botkit = require('botkit/lib/Botkit.js');
var _ = require('lodash');
var GameController = require('./GameController');

var controller = Botkit.slackbot({
    debug: false,
    json_file_store: 'storage/db.json'
});

var stdin = process.openStdin();

stdin.addListener("data", function(d) {
    var text = d.toString().trim();

    GameController.loadOrCreate(controller.storage, commandBot, gameBot, 'testTeam', 'testChannel', function(gameController){

        text = d.toString().trim().toLowerCase().split(/ +/);
        var userId = text.shift();

        gameController.handlePlayerAction(userId, text, null);

        //bot.replyPublic(message, message.text);
        //bot.replyPublic(message,'Everyone can see this part of the slash command');
        //bot.replyPrivate(message,'Only the person who used the slash command can see this.');
    });
});

var commandBot = {
    replyPrivate: function(msg, text){
        console.log('');
        console.log(text);
        console.log('');
    }
};

var gameBot = {
    say: function(msg){
        console.log('');
        console.log('Said to ' + msg.channel + ':');
        console.log(msg.text);
        console.log('');
    },
    api: {
        users: {
            info: function(data, callback){
                callback(null, {
                    user: {
                        name: users[data.user]
                    }
                });
            }
        },
        im: {
            open: function(data, callback){
                callback(null, {
                    channel: {
                        id: 'IM-' + users[data.user]
                    }
                })
            }
        }
    }
};

var users = {
    1: 'Alice',
    2: 'Bob',
    3: 'Charlie'
};

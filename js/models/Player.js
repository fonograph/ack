
function Player(data) {
    this.id = '';
    this.name = '';
    this.imChannel = '';
    this.score = 0;
    this.moves = [];
    this.bounties = [];
    this.jobs = []; // just target IDs for now
    this.secrets = []; // player IDs
}

Player.create = function(id, name, imChannel) {
    var player = new Player();
    player.id = id;
    player.name = name;
    player.imChannel = imChannel;

    return player;
};

module.exports = Player;
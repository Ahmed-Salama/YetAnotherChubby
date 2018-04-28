Array.prototype.random = function () {
  return this[Math.floor((Math.random() * this.length))];
}

const range = x => Array.from(Array(x).keys());

// constants
keyDefs = {
    "37": "left",
    "38": "up",
    "39": "right",
    "40": "down",
    "32": "space"
};
time_step = 150;
canvas_size = 800;
canvas_offset_x = 50;
canvas_offset_y = 90;
block_size = 18;
block_shade_offset = 0.25;
field_width = 20;
inner_field_width = field_width - 2;
field_height = 30;

const replica_color = "#2ECC71";
const client_color = "#F7DC6F";

$(document).ready(function() {
    const input = $('body');
    const canvas = document.getElementById("canvas");
  
    const ctx = canvas.getContext("2d");
    const replicaSize = 5;

    // arrange replicas in a circle
    const circleRadius = 200;
    replicas = Immutable.Range(0, replicaSize).map(i => {
      var x = 270 + circleRadius * Math.cos(- Math.PI / 2 + 2 * Math.PI * i / replicaSize);
      var y = 300 + circleRadius * Math.sin(- Math.PI / 2 + 2 * Math.PI * i / replicaSize);
      return new Replica("r" + i, x, y);
    }).toList();

    const clients = Immutable.List.of(new Client("c0", 270, 540));

    // construct links between replica pairs
    const links = Immutable.Range(0, replicaSize).flatMap(src_idx => {
      return Immutable.Range(0, replicaSize).map(dest_idx => {
        if (src_idx == dest_idx) return null;
        else {
          const src_replica = replicas.get(src_idx);
          const dest_replica = replicas.get(dest_idx);
          const link = new Link(src_replica, dest_replica);
          src_replica.addLink(dest_replica.name, link);
          return link;
        }
      }).filter(link => link != null);
    })
    .concat(Immutable.Range(0, replicaSize).flatMap(replica_idx => {
      return Immutable.Range(0, clients.size).flatMap(client_idx => {
          const replica = replicas.get(replica_idx);
          const client = clients.get(client_idx);

          const link1 = new Link(client, replica);
          client.addLink(replica.name, link1);

          const link2 = new Link(replica, client);
          replica.addLink(client.name, link2);
          
          return Immutable.List([link1, link2]);
      });
    }))
    .toList();

    console.log(links.size);
    
    // start draw loop
    setInterval(() => {
      ctx.save();
      ctx.fillStyle = "#EAECEE";
      ctx.fillRect(0, 0, 600, 650);

      ctx.fillStyle = "black";
      ctx.font = "Bold 30px Arial";
      ctx.fillText("PAXOS", 220, 50);
      
      ctx.font = "Bold 18px Arial";
      ctx.fillText("Legend", 20, 40);
      
      ctx.font = "12px Arial";
      ctx.fillText("Replica ", 45, 65);
      
      ctx.fillStyle = replica_color;
      ctx.beginPath();
      ctx.arc(30, 60, 8, Math.PI * 2, false);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = "black";
      ctx.font = "12px Arial";
      ctx.fillText("Client ", 45, 85);
      
      ctx.fillStyle = client_color;
      ctx.beginPath();
      ctx.arc(30, 80, 8, Math.PI * 2, false);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "black";
      ctx.font = "12px Arial";
      ctx.fillText("Master ", 45, 105);
      
      ctx.fillStyle = "#3498DB";
      ctx.beginPath();
      ctx.arc(30, 100, 8, Math.PI * 2, false);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      links.forEach(link => link.draw(ctx));
      replicas.forEach(replica => replica.draw(ctx));
      clients.forEach(client => client.draw(ctx));
    }, 100);
});

class Packet {
  constructor(data, type) {
    this.data = data;
    this.type = type;
  }  
}

class Deliverable {
  constructor(packet) {
    this.packet = packet;
    this.progress = 0;
  }
}

class Link {
  constructor(src, dest) {
    // state properties
    this.src = src;
    this.dest = dest;
    this.deliverables = Immutable.List();
    this.speed = 0.1;

    // set infinite loop for the link 
    setInterval(this.execute.bind(this), 100);
  }

  draw(ctx) {
    ctx.save();

    ctx.strokeStyle = "black";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(this.src.x, this.src.y);
    ctx.lineTo(this.dest.x, this.dest.y);
    ctx.stroke();

    this.deliverables.forEach(d => {
      ctx.beginPath();
      ctx.arc(
        this.src.x + d.progress * (this.dest.x - this.src.x),
        this.src.y + d.progress * (this.dest.y - this.src.y), 4, 0, Math.PI * 2, false);
      ctx.fill();
    });

    ctx.restore();
  }

  execute() {
    this.deliverables.forEach(d => d.progress += this.speed);
    const done = this.deliverables.filter(d => d.progress >= 1);
    const still = this.deliverables.filter(d => d.progress < 1);

    this.deliverables = still;
    done.forEach(d => {
      this.dest.receivePacket(d.packet);
    });
  }

  deliver(packet) {
    const deliverable = new Deliverable(packet);
    this.deliverables = this.deliverables.push(deliverable);
  }
}

class Node {
  constructor(name, x, y) {
    // visual properties
    this.name = name;
    this.x = x;
    this.y = y;

    // state properties
    this.counter = 0;
    this.links = Immutable.Map();
    this.queue = Immutable.List();
    this.status = "alive";

    // set infinite loop for the replica 
    this.timerId = setInterval(this.execute.bind(this), 100);
  }

  drawIfKilled(ctx) {
    if (this.status == "dead"){
      ctx.save();

      ctx.lineWidth = 4;
      ctx.strokeStyle = "#C30000";

      ctx.beginPath();
      ctx.moveTo(this.x + 12, this.y + 12);
      ctx.lineTo(this.x - 12, this.y - 12);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.x - 12, this.y + 12);
      ctx.lineTo(this.x + 12, this.y - 12);
      ctx.stroke();

      ctx.restore();
    }
  }

  drawMessageQueue(ctx) {
    const drawMessageQueueEntry = (index, font, text) => {
      ctx.save();
      ctx.fillStyle = "#CCD1D1";
      const spacing = 14;
      const y = 30 + this.y + spacing * index;
      ctx.fillRect(this.x, y - 10, 70, spacing);
      ctx.strokeRect(this.x, y - 10, 70, spacing);
      ctx.font = font;
      ctx.fillStyle = "black";
      ctx.fillText(text, this.x + 2, y);
      ctx.restore();
    }
    drawMessageQueueEntry(0, "Bold 10px Arial", "Messages");

    var queueIndex = 1;
    this.queue.forEach(p => {
      drawMessageQueueEntry(queueIndex, "10px Arial", p.type + ": " + p.data);
      queueIndex++;
    });
  }

  drawName(ctx) {
    ctx.save();
    ctx.font = "12px Arial";
    ctx.fillStyle = "black";
    ctx.fillText(this.name, this.x - 6, this.y + 4);
    ctx.restore();
  }

  addLink(replica_idx, link) {
    this.links = this.links.set(replica_idx, link);
  }

  sendPacket(address, data, type) {
    this.links.get(address).deliver(new Packet(data, type));
  }

  sendPacket2(address, packet) {
    this.links.get(address).deliver(packet);
  }

  receivePacket(packet) {
    if(this.status == "alive")this.queue = this.queue.push(packet);
  }

  consumeMessage() {
    const element = this.queue.first();
    this.queue = this.queue.shift();
    return element;
  }

  kill(){
    clearTimeout(this.timerId);
    this.queue = this.queue.clear();
    this.status = "dead";
  }
  revive(){
    this.timerId = setInterval(this.execute.bind(this), 100);
    this.status = "alive";
  }

  execute() {
    this.counter++;
  }
}

class Replica extends Node {
  constructor(name, x, y) {
    super(name, x, y);
    this.color = replica_color;

    if(name == "r0")this.isMaster = true;
    else this.isMaster = false;

    this.consensus_value = -1;
    
    this.kill_time = Math.floor(Math.random() * 200);
  }

  draw(ctx) {
    ctx.save();

    if(this.isMaster)ctx.fillStyle = "#3498DB";
    else ctx.fillStyle = this.color;

    ctx.beginPath();
    ctx.arc(this.x, this.y, 14, 0, Math.PI * 2, false);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    this.drawIfKilled(ctx);
    this.drawMessageQueue(ctx);

    ctx.fillStyle = "#80FFEB";
    ctx.fillRect(this.x + 5, this.y - 32, 40, 15);
    ctx.strokeRect(this.x + 5, this.y - 32, 40, 15);
    ctx.font = "12px Arial";
    ctx.fillStyle = "black";
    ctx.fillText(this.consensus_value, this.x + 8, this.y - 20);
    ctx.restore();

    this.drawName(ctx);

    ctx.restore();
  }

  execute() {
    super.execute();

    if(this.counter >= this.kill_time){
      this.kill();
    }

    if(this.counter % 20 == 4){
      if(this.queue.length > 0){
        const data = this.queue.first().data;
        const type = this.queue.first().type;

        if(this.isMaster){
          if(type == "read"){
            this.sendPacket("c0", this.consensus_value, "reply");
          }else if(type == "write"){
            this.consensus_value = data;
            this.sendPacket("c0", "success", "reply");
          }
        }else{
          this.sendPacket("c0", "r0", "redirect");
        }
        this.queue = this.queue.shift();
      }
    }
  }
}

class Client extends Node {
  constructor(name, x, y) {
    super(name, x, y);
    this.color = client_color;
    this.state = "idle";
    this.current_request = -1;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 14, 0, Math.PI * 2, false);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    this.drawIfKilled(ctx);
    this.drawMessageQueue(ctx);

    this.drawName(ctx);

    ctx.restore();
  }

  execute() {
    super.execute();

    if (this.counter % 40 == 3) {
      if(this.state == "idle"){
        var rnd = Math.floor(Math.random() * 2);
        if(rnd == 0){
          this.current_request = new Packet(Math.floor(Math.random() * 1000), "write");
        }else{
          this.current_request = new Packet(-1, "read");
        }
        this.sendPacket2("r" + Math.floor(Math.random() * this.links.length), this.current_request);
        this.state = "waiting";
      }
    }
    if(this.counter % 20 == 10) {
      if(this.queue.length > 0){
        const data = this.queue.first().data;
        const type = this.queue.first().type;

        if(type == "reply"){
          this.current_request = -1;
          this.state = "idle";
        }else if(type == "redirect"){
          this.sendPacket2(data, this.current_request);
        }

        this.queue = this.queue.shift();
      }
    }
  }
}
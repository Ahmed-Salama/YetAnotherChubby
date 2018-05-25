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

const replica_health_trigger = 10;

const replica_color = "#F7DC6F";
const master_color = "#EB984E";
const client_color = "#C39BD3";

//Function to get the mouse position
const getMousePos = (canvas, event) => {
  var rect = canvas.getBoundingClientRect();
  return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
  };
}

mouse_position = {
  x: 0,
  y: 0
};
mouse_released = false;

$(document).ready(function() {
    const input = $('body');
    const canvas = document.getElementById("canvas");

    canvas.addEventListener('mousemove', function(e) {
      mouse_position = getMousePos(canvas, e);
    });

    canvas.addEventListener('mouseup', function(e) {
      mouse_released = true;
    });
  
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
      
      ctx.fillStyle = master_color;
      ctx.beginPath();
      ctx.arc(30, 100, 8, Math.PI * 2, false);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      links.forEach(link => link.draw(ctx));
      replicas.forEach(replica => replica.draw(ctx));
      clients.forEach(client => client.draw(ctx));

      mouse_released = false;
    }, 40);
});

class Packet {
  constructor(data, type) {
    this.data = data;
    this.type = type;
    this.sender = -1;
  }  
}

class Proposal {
  constructor(number, value) {
    this.number = number;
    this.value = value;
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
    this.speed = 0.04;

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
      if(p.type == "propose")drawMessageQueueEntry(queueIndex, "10px Arial", p.type + ": " + p.data.number);
      else if(p.type == "apply")drawMessageQueueEntry(queueIndex, "10px Arial", p.type + ": " + p.data.type);
      else drawMessageQueueEntry(queueIndex, "10px Arial", p.type + ": " + p.data);

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
    this.queue = this.queue.clear();
    this.status = "dead";
  }

  revive(){
    this.status = "alive";
    this.master = -1;
  }

  isMouseOver() {
    return (this.x - mouse_position.x) * (this.x - mouse_position.x) +
           (this.y - mouse_position.y) * (this.y - mouse_position.y) <= 18 * 18;
  }

  isMouseOverHealthTrigger() {
    return (this.x + replica_health_trigger - mouse_position.x) * (this.x + replica_health_trigger - mouse_position.x) +
           (this.y - replica_health_trigger - mouse_position.y) * (this.y - replica_health_trigger - mouse_position.y) <= 10 * 10;
  }

  execute() {
    this.counter++;

    if (this.status == "alive") {
      this.executeIfAlive();
    }
  }

  executeIfAlive() {
  }
}

class Replica extends Node {
  constructor(name, x, y) {
    super(name, x, y);

    this.color = replica_color;
    this.type = "replica";

    this.master = -1;
    this.consensus_value = -1;
  
    this.proposal_number = 0;
    this.proposal_value = -1;
    this.promises_counter = 0;
    this.accepted_counter = 0;

    this.promise = -1;
    this.accepted_value = -1;
    
    this.state = "idle";
  }

  draw(ctx) {
    ctx.save();

    if(this.name == this.master)ctx.fillStyle = master_color;
    else ctx.fillStyle = this.color;

    ctx.beginPath();
    ctx.arc(this.x, this.y, 14, 0, Math.PI * 2, false);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    this.drawIfKilled(ctx);
    this.drawMessageQueue(ctx);

    ctx.fillStyle = "#ABEBC6";
    ctx.fillRect(this.x + 5, this.y - 32, 40, 15);
    ctx.strokeRect(this.x + 5, this.y - 32, 40, 15);
    ctx.font = "12px Arial";
    ctx.fillStyle = "black";
    ctx.fillText(this.consensus_value, this.x + 8, this.y - 20);
    ctx.restore();

    this.drawName(ctx);

    // mouse logic
    if (this.isMouseOver()) {
      ctx.save();
      ctx.fillStyle = this.status == "alive" ? "#E74C3C" : "#2ECC71";
      ctx.beginPath();
      ctx.arc(this.x + replica_health_trigger, this.y - replica_health_trigger, 4, 0, Math.PI * 2, false);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  nextProposalNumber(){
    this.proposal_number = (Math.floor(this.proposal_number / 10) + 1) * 10 + parseInt(this.name[1]);
  }

  sendToAll(packet){
    this.links.forEach(link => {
      if(link.dest.type == "replica")link.deliver(packet);
    })
  }
  
  proposeLeadership() {
    this.master = -1;
    const packet = new Packet(this.name, "leader");

    this.queue = this.queue.push(packet);
    this.sendToAll(packet);
  }

  executeIfAlive() {
    super.executeIfAlive();

    if(this.counter % 500 == 10){
      this.proposeLeadership();
    }
    if(this.counter % 20 == 4){
      if(this.queue.size > 0){
        const packet = this.queue.first();
        const data = packet.data;
        const type = packet.type;

        if(type == "leader"){
          if(this.master == -1 || data > this.master)this.master = data; 
        }else if(type == "prep"){
          if(this.promise <= data){
            this.sendPacket(packet.sender, this.accepted_value, "promise");
          }else{

          }
        }else if(type == "promise"){
          this.promises_counter++;
          if(data != -1)this.proposal_value = data;

          if(this.promises_counter > Math.floor(this.links.size / 2)){
            var proposal_packet = new Packet(new Proposal(this.proposal_number, this.proposal_value), "propose");
            proposal_packet.sender = this.name;

            this.sendToAll(proposal_packet);
            this.promises_counter = 0;
          }
        }else if(type == "propose"){
          if(this.promise <= data.number){
            this.sendPacket(packet.sender, -1, "accepted");
          }else{

          }
        }else if(type == "accepted"){
          this.accepted_counter++;
          if(this.accepted_counter > Math.floor(this.links.size / 2)){
            const apply_packet = new Packet(this.proposal_value, "apply");
            
            this.queue = this.queue.push(apply_packet);
            this.sendToAll(apply_packet);
            this.sendPacket("c0", "success", "reply");

            this.accepted_counter = 0;
          }
        }else if(type == "apply"){
          if(data.type == "write"){
            this.consensus_value = data.data;
          }
        }else{
          if(this.name == this.master){
            if(type == "read"){
              this.sendPacket("c0", this.consensus_value, "reply");
            }else if(type == "write"){
              this.nextProposalNumber();
              this.proposal_value = packet;

              var proposal_packet = new Packet(this.proposal_number, "prep");
              proposal_packet.sender = this.name;

              this.promises_counter = 0;
              this.sendToAll(proposal_packet);
            }
          }else{
              this.sendPacket("c0", this.master, "redirect");
          }
        }
        this.queue = this.queue.shift();
      }
    }
  }

  execute() {
    super.execute();

    // mouse logic
    if (this.isMouseOver() && this.isMouseOverHealthTrigger() && mouse_released) {
      if (this.status == "alive") {
        this.kill();
      } else {
        this.revive();
      }
    }
  }
}

class Client extends Node {
  constructor(name, x, y) {
    super(name, x, y);
    
    this.color = client_color;
    this.type = "client";

    this.state = "idle";
    this.current_request = -1;
    this.last_active = 0;
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

  executeIfAlive() {
    super.executeIfAlive();

    if (this.counter % 40 == 3) {
      if(this.state == "idle"){
        var rnd = Math.floor(Math.random() * 2);
        if(rnd == 0){
          this.current_request = new Packet(Math.floor(Math.random() * 1000), "write");
        }else{
          this.current_request = new Packet(-1, "read");
        }
        this.sendPacket2("r" + Math.floor(Math.random() * this.links.size), this.current_request);
        this.state = "waiting";
        this.last_active = this.counter;
      }
    }
    if(this.counter % 20 == 10) {
      if(this.queue.size > 0){
        const data = this.queue.first().data;
        const type = this.queue.first().type;

        if(type == "reply"){
          this.current_request = -1;
          this.state = "idle";
        }else if(type == "redirect"){
          if(data == -1){
            this.sendPacket2("r" + Math.floor(Math.random() * this.links.size), this.current_request);
          }else{
            this.sendPacket2(data, this.current_request);
          }
        }

        this.queue = this.queue.shift();
        this.last_active = this.counter;
      }
    }else{
      if(this.counter - this.last_active > 500){
        this.sendPacket2("r" + Math.floor(Math.random() * this.links.size), this.current_request);
        this.last_active = this.counter;
      }
    }
  }
}
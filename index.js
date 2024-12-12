import express from 'express';
import {Server} from 'socket.io';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3500;
const ADMIN = 'Admin';

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const expressServer = app.listen(PORT, () => {
	console.log(`listening on port ${PORT}`);
});

// state - add to db later
const UsersState = {
	users: [],
	setUsers: function (newUsersArray) {
		this.users = newUsersArray;
	},
};

const io = new Server(expressServer, {
	cors: {
		origin:
			process.env.NODE_ENV === 'production'
				? false
				: ['http://localhost:5500', 'http://127.0.0.1:5500'],
	},
});

io.on('connection', (socket) => {
	console.log(`User ${socket.id} connected`);

	// upon connection - only to user
	socket.emit('message', buildMsg(ADMIN, 'welcome to chat app'));

	socket.on('enterRoom', ({name, room}) => {
		// leave a previous room if they were in another room
		const prevRoom = getUser(socket.id)?.room;

		if (prevRoom) {
			socket.leave(prevRoom);
			io.to(prevRoom).emit(
				'message',
				buildMsg(ADMIN, `${name} has left the room`),
			);
		}

		const user = activateUser(socket.id, name, room);

		// Cannot update previous room users list until after the state update in activate user
		if (prevRoom) {
			io.to(prevRoom).emit('userList', {
				users: getUsersInRoom(prevRoom),
			});
		}

		// join room
		socket.join(user.room);

		// to user who joined the room
		socket.emit(
			'message',
			buildMsg(ADMIN, `You have joined the ${user.room} room`),
		);

		// to everyone else
		socket.broadcast
			.to(user.room)
			.emit(
				'message',
				buildMsg(
					ADMIN,
					`${user.name} has joined the ${user.room} room`,
				),
			);

		// Update user list for room
		io.to(user.room).emit('userList', {
			users: getUsersInRoom(user.room),
		});

		// update room list for everyone
		io.emit('roomList', {
			rooms: getAllActiveRooms(),
		});
	});

	socket.on('disconnect', () => {
		const user = getUser(socket.id);
		userLeavesApp(socket.id);

		if (user) {
			io.to(user.room).emit(
				'message',
				buildMsg(ADMIN, `${user.name} has left the room`),
			);

			io.to(user.room).emit('userList', {
				users: getUsersInRoom(user.room),
			});

			io.emit('roomList', {
				rooms: getAllActiveRooms(),
			});
		}
		console.log(`User ${socket.id} disconnected`);
	});

	// Listening for message event
	socket.on('message', ({name, text}) => {
		const room = getUser(socket.id)?.room;
		if (room) {
			io.to(room).emit('message', buildMsg(name, text));
		}
	});

	socket.on('activity', (name) => {
		const room = getUser(socket.id)?.room;
		if (room) {
			socket.broadcast.to(room).emit('activity', name);
		}
	});
});

function buildMsg(name, text) {
	return {
		name,
		text,
		time: new Intl.DateTimeFormat('default', {
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
		}).format(new Date()),
	};
}

// User functions
function activateUser(id, name, room) {
	const user = {id, name, room};
	UsersState.setUsers([
		...UsersState.users.filter((user) => user.id !== id),
		user,
	]);
	return user;
}

function userLeavesApp(id) {
	UsersState.setUsers(UsersState.users.filter((user) => user.id !== id));
}

function getUser(id) {
	return UsersState.users.find((user) => user.id === id);
}

function getUsersInRoom(room) {
	return UsersState.users.filter((user) => user.room === room);
}

function getAllActiveRooms() {
	return Array.from(new Set(UsersState.users.map((user) => user.room)));
}

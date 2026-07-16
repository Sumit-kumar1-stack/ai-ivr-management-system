import http from "http";

import { Server } from "socket.io";

const httpServer = http.createServer();

export const io = new Server(httpServer, {

    cors: {

        origin: "*",

        methods: ["GET", "POST"]

    }

});

io.on("connection", socket => {

    console.log(

        "🟢 Dashboard Connected:",

        socket.id

    );

    socket.on(

        "disconnect",

        () =>

            console.log(

                "🔴 Dashboard Disconnected:",

                socket.id

            )

    );

});

const PORT = 4000;

httpServer.listen(PORT, () => {

    console.log(

        `🚀 Socket Server running on ${PORT}`

    );

});
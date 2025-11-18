const express = require('express');
const { ECSClient, RunTaskCommand} = require('@aws-sdk/client-ecs');
const cors = require('cors');
const bodyParser = require('body-parser');
const {Server} = require('socket.io');
const Redis = require('ioredis');

const app = express();
const PORT = 9000

//redis api
const subscriber = new Redis('');

const io = new Server({cors:'*'});

io.on('connection', socket => {
    socket.on('subscribe',channel => {
        socket.join(channel);
        // socket.emit('message',`Joined ${channel}`);
    })
})

io.listen(9002,()=>console.log('Socket server 9002'))

const ecsCLient = new ECSClient({
    region: '',
    credentials:{
        accessKeyId:'',
        secretAccessKey:''
    }
})

const config = {
    CLUSTER: '',
    TASK: ''
}

// app.use(express.json)
app.use(cors());
app.use(bodyParser.json());

app.post('/project', async (req, res) => {
    const gitURL = req.body.gitURL;
    const projectSlug = req.body.slug;


    // spin task
    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['', '', '', '', '', ''],
                securityGroups: ['']
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'builder-image',
                    environment: [
                        {name: 'GIT_REPOSITORY__URL', value: gitURL},
                        {name: 'PROJECT_ID', value: projectSlug}
                    ]
                }
            ]
        }
    })

    await ecsCLient.send(command);

    return res.status(200).send({status: 'queued', data: {projectSlug, url: `http://${projectSlug}.localhost:8000`}});
})


async function initRedisSubscibe(){
    console.log('Subscribed to logs ...')
    subscriber.psubscribe('logs:*');
    subscriber.on('pmessage',(pattern, channel, message) => {
        console.log(channel,message);
        io.to(channel).emit('message',message);
    })
}

initRedisSubscibe();

app.listen(PORT, () => console.log(`API server running on ${PORT}`));


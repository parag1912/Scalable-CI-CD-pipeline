"use client"
import {useState, useEffect, useCallback} from 'react'
import Nav from './components/Nav'
import axios from 'axios';
import { io } from "socket.io-client";



const backend_url = 'http://localhost:9000'
const socket = io("http://localhost:9002");

export default function Home() {

  
  const [textUrl, setTextUrl] = useState('');
  const [hostedUrl, setHostedUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [slug, setSlug] = useState('');

  const handleSubmit = async (e:any) => {
    e.preventDefault()
    await axios.post(
        `${backend_url}/project`,
        {
            gitURL:textUrl,
            slug: slug
        }
    )
    .then((response) => {
        setHostedUrl(response.data.data.url);
        console.log(`Subscribing to logs:${slug}`);
        socket.emit("subscribe", `logs:${slug}`);
    })
    .catch((error) => {
        console.log(error);
    })
  }

  const handleSocketIncommingMessage = useCallback((message: string) => {
    console.log(`[Incomming Socket Message]:`, typeof message, message);
    const { log } = JSON.parse(message);
    let arr:string[] = logs;
    if(arr.length>13){
        let element = arr.shift();
    }
    arr.push(log);
    console.log(arr);
    setLogs([...arr]);
  }, []);

  useEffect(() => {
      socket.on("message", handleSocketIncommingMessage);

      return () => {
        socket.off("message", handleSocketIncommingMessage);
      };
  }, [handleSocketIncommingMessage]);

  useEffect(() => {
      console.log(logs);
  }, [logs]);


  return (
    <div className='h-screen flex flex-col'>
        <Nav/>
        <div className="flex w-full flex-1">
            <div className='flex flex-col justify-center items-center flex-1'>
                <form onSubmit={(event) => handleSubmit(event)} className='flex flex-col items-end jusitfy-center w-96'>

                    <label className="form-control w-full">
                        <div className="label">
                            <span className="label-text">Unique slug</span>
                        </div>
                        <input type="text" placeholder="Type here" className="input input-bordered w-full" onChange={(event)=>setSlug(event.target.value)} required/>
                    </label>
                    <br/>
                    <label className="form-control w-full">
                        <div className="label">
                            <span className="label-text">Git repo URL</span>
                        </div>
                        <input type="text" placeholder="Type here" className="input input-bordered w-full" onChange={(event)=>setTextUrl(event.target.value)} required/>
                    </label>
                    <br/>
                    <button type="submit" className="btn btn-primary w-full">Deploy</button>
                </form>
                <br/>
                {hostedUrl===''?
                    <br/>
                :
                    <div className=''>
                        Website will be live within few minutes <a className='text-primary' href={hostedUrl} target="_blank">@ {hostedUrl}</a>
                    </div>
                }
            </div>

            <div className='w-1 bg-neutral my-4'></div>

            <div className="w-1/2">
                {logs.length === 0 ?
                    <div className="flex justify-center items-center w-full h-full">No logs to display.</div>
                :
                    <div className="m-8 flex flex-col h-5/6">
                        <div className="text-xl m-4">Logs</div>
                        <div className="mockup-code flex-1 overflow-x-auto ">
                            {logs.map((log, i) => (
                                <pre data-prefix="~" key={i}><code>{log.replaceAll('\n','')}</code></pre>
                            ))}
                        </div>
                    </div>
                }
            </div>
        </div>
    </div>
  )
}

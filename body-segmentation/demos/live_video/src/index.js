
import { STATE } from './shared/params';

import { setupDatGui,setControllers, getController} from './option_panel';
import Easing from './easing'

const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const maskElement = document.getElementsByClassName("mask")[0];
const bgMusic = document.getElementById('bgMusic');
const canvasCtx = canvasElement.getContext('2d');
const maskCtx = maskElement.getContext('2d');

let matrixFrame = [];
let step = 0;
let start_time;
let end_time = null;
let setting = {
    default: {
        scale: 0.329,
        offsetX: 286.1,
        offsetY: -87.4,
        count: 20,
        row: 6,
        spaceX: 162,
        spaceY: 6,
        fontSize:10
    },
    clone: {
        scale: 0.329,
        offsetX: -114,
        offsetY: 10.5,
        count: 36,
        row: 6,
        spaceX: 162,
        spaceY: 6,
        fontSize:10
    }
}
function onResults(results) {
    // console.log("results:",results.image)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    canvasCtx.drawImage(results.image, 0, 0,
                        canvasElement.width, canvasElement.height);
                        
    // // // Only overwrite missing pixels.
    canvasCtx.globalCompositeOperation = 'destination-in';
    canvasCtx.drawImage(
        results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // let cdata = canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height)
    maskCtx.clearRect(0, 0, maskElement.width, maskElement.height);

    // console.log(cdata)
    for (let i = 0; i < STATE.backend.count; i++) {
        let col = Math.floor(STATE.backend.count / STATE.backend.row);
        let sx = (( i % col) * STATE.backend.spaceX) + STATE.backend.offsetX;
        let sy = (Math.floor(i / col)) * ((canvasElement.height / STATE.backend.row) + STATE.backend.spaceY) + STATE.backend.offsetY;
        let swidth = STATE.backend.scale * canvasElement.width;
        let sheight = STATE.backend.scale * canvasElement.height;
        switch (step) {
            case 1:
                let sec = 3
                let start = 100
                let end = 1000
                let currentTime = (new Date().getTime() - start_time) / 1000
                let proccess = Easing.easeInOutBounce(currentTime,start, end, sec)
                // currentTime, startValue, changeValue, duration
                maskCtx.filter = `brightness(${proccess}%)`
                maskCtx.drawImage(canvasElement, sx, sy, swidth, sheight);
                let delay = 0.2
                if (proccess >= end && !end_time) {
                    end_time = new Date().getTime()
                }
                if (end_time && new Date().getTime() - end_time >= delay * 1000) {
                    step = 2
                    end_time = null
                }
                break;
            case 2:

                maskCtx.filter = `brightness(0%)`
                maskCtx.drawImage(canvasElement, sx, sy,
                    swidth, sheight);
                break;
            default:
                maskCtx.filter = `brightness(100%)`
                maskCtx.drawImage(canvasElement, sx, sy,
                    swidth, sheight);   
                break;
        }
    }
}
function setMatrix() {
    for (let x = 0; x < 2; x++) {
        matrix(x)
    }
} 
function matrix(inx) {
    // geting canvas by Boujjou Achraf
    var c = document.getElementById("bg");
    var ctx = c.getContext("2d");
  
    clearInterval(matrixFrame[inx])
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(0, 0, c.width, c.height);
    //making the canvas full screen
    c.height = window.innerHeight;
    c.width = window.innerWidth;
  
    //chinese characters - taken from the unicode charset
    var matrix = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
    //converting the string into an array of single characters
    matrix = matrix.split("");
  
    var font_size = STATE.backend.fontSize + (inx * 5);
    var columns = c.width / font_size; //number of columns for the rain
    //an array of drops - one per column
    var drops = [];
    //x below is the x coordinate
    //1 = y co-ordinate of the drop(same for every drop initially)
    for (var x = 0; x < columns; x++)
      drops[x] = 1;
  
    //drawing the characters
    function draw() {
      //Black BG for the canvas
      //translucent BG to show trail
      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      ctx.fillRect(0, 0, c.width, c.height);
  
      ctx.fillStyle = "#76ff12"; //green text
      ctx.font = font_size + "px arial";
      //looping over drops
      for (var i = 0; i < drops.length; i++) {
  
        //a random chinese character to print
        var text = matrix[Math.floor(Math.random() * matrix.length)];
        //x = i*font_size, y = value of drops[i]*font_size
        ctx.fillText(text, i * font_size, drops[i] * font_size);
  
        //sending the drop back to the top randomly after it has crossed the screen
        //adding a randomness to the reset to make the drops scattered on the Y axis
        if (drops[i] * font_size > c.height && Math.random() > 0.995)
          drops[i] = 0;
  
        //incrementing Y coordinate
        drops[i]++;
  
      }
    }
  
    matrixFrame[inx] = setInterval(draw, 35+(inx*10));
}

function setKey(){
    document.addEventListener('keydown', (event) => {
        var code = event.code;
        // Digit1 Digit2 KeyO
        switch (code) {
            case "Digit1":
                step = 1;
                start_time = new Date().getTime();
                Object.keys(setting.default).map(key => {
                    setControllers(key, setting.default[key])
                })
                break;
            case "Digit2":
                Object.keys(setting.clone).map(key => {
                    setControllers(key, setting.clone[key])
                })
                break;
            case "Digit3":
                location.reload()
                bgMusic.play()
                break;
        }
        console.log(code)
        // console.log(`Key pressed ${name} \r\n Key code value: ${code}`);
  }, false);
}
async function app() {
    bgMusic.playbackRate = 2.5
    maskElement.width = window.innerWidth
    maskElement.height = window.innerHeight
    setKey()
    const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
            // console.log("file:",file)
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });
    
    selfieSegmentation.setOptions({
        modelSelection: 1,
    });
    selfieSegmentation.onResults(onResults);
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await selfieSegmentation.send({image: videoElement});
        },
        width: 1280,
        height: 720
    });
    camera.start();

    await setupDatGui();
    setMatrix();
    let fontSizeC = getController('fontSize')
    fontSizeC.onChange(setMatrix)
}

app()
"use client";

import { cn } from "@/lib/utils";
import { grayDark } from "@radix-ui/colors";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
  dotSize?: number;
  spacing?: number;
  opacity?: number;
  width?: number;
  height?: number;
  className?: string;
  flickerRatio?: number;
  flickeringSpeed?: number;
}

const vertexShaderSource = `
  attribute vec2 a_position;
  attribute float a_opacity;
  attribute float a_flickerPhase;
  attribute float a_isFlickering;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_dotSize;
  
  varying float v_opacity;
  varying vec2 v_position;
  
  float fastHash(float n) {
    return fract(n * 0.1031);
  }
  
  void main() {
    gl_Position = vec4((a_position / u_resolution) * 2.0 - 1.0, 0, 1);
    gl_Position.y = -gl_Position.y;
    gl_PointSize = u_dotSize;
    
    v_position = a_position / u_resolution;
    
    v_opacity = a_opacity * (1.0 - a_isFlickering * 0.5 * (1.0 - step(0.5, fastHash(floor(u_time + a_flickerPhase * 10.0)))));
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  
  uniform vec3 u_color;
  varying float v_opacity;
  varying vec2 v_position;
  
  void main() {
    vec2 pointCenter = gl_PointCoord - vec2(0.5);
    float pointDistance = length(pointCenter);
    float dotAlpha = smoothstep(0.5, 0.3, pointDistance);
    
    float finalAlpha = dotAlpha * v_opacity;
    
    gl_FragColor = vec4(u_color, finalAlpha);
  }
`;

// TODO: match interface to the magicui one
export const FlickeringGrid: React.FC<FlickeringGridProps> = ({
  dotSize = 5,
  spacing = 12,
  opacity = 0.8,
  width,
  height,
  className,
  flickerRatio = 0.1,
  flickeringSpeed = 6,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  const isDocumentVisibleRef = useRef<boolean>(true);
  const [isInView, setIsInView] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const dotsRef = useRef<
    { x: number; y: number; opacity: number; flickerPhase: number; isFlickering: boolean }[]
  >([]);

  const buffersRef = useRef<{
    position?: WebGLBuffer;
    opacity?: WebGLBuffer;
    flickerPhase?: WebGLBuffer;
    isFlickering?: WebGLBuffer;
  }>({});

  const staticDataRef = useRef<{
    positions?: Float32Array;
    opacities?: Float32Array;
    flickerPhases?: Float32Array;
    isFlickeringArray?: Float32Array;
    color?: [number, number, number];
    initialized: boolean;
    needsOpacityUpdate: boolean;
  }>({
    initialized: false,
    needsOpacityUpdate: true,
  });

  const frameInterval = 1000 / flickeringSpeed;

  const createShader = useCallback(
    (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    },
    [],
  );

  const createProgram = useCallback(
    (gl: WebGLRenderingContext): WebGLProgram | null => {
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

      if (!vertexShader || !fragmentShader) return null;

      const program = gl.createProgram();
      if (!program) return null;

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
      }

      return program;
    },
    [createShader],
  );

  const setupWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGL not supported");
      return false;
    }

    glRef.current = gl;

    const program = createProgram(gl);
    if (!program) return false;

    programRef.current = program;
    gl.useProgram(program);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return true;
  }, [createProgram]);

  const generateDots = useCallback(
    (canvasWidth: number, canvasHeight: number) => {
      const dots: {
        x: number;
        y: number;
        opacity: number;
        flickerPhase: number;
        isFlickering: boolean;
      }[] = [];

      for (let x = spacing; x < canvasWidth; x += spacing) {
        for (let y = spacing; y < canvasHeight; y += spacing) {
          const baseOpacity = Math.random() * 0.7 + 0.1;
          const flickerPhase = Math.random() * Math.PI * 2;
          const isFlickering = Math.random() < flickerRatio;

          dots.push({
            x: x,
            y: y,
            opacity: baseOpacity,
            flickerPhase: flickerPhase,
            isFlickering: isFlickering,
          });
        }
      }

      return dots;
    },
    [spacing, flickerRatio],
  );

  const initializeStaticData = useCallback(
    (dots: typeof dotsRef.current) => {
      const positions = new Float32Array(dots.length * 2);
      const opacities = new Float32Array(dots.length);
      const flickerPhases = new Float32Array(dots.length);
      const isFlickeringArray = new Float32Array(dots.length);

      dots.forEach((dot, i) => {
        positions[i * 2] = dot.x;
        positions[i * 2 + 1] = dot.y;
        opacities[i] = dot.opacity * opacity;
        flickerPhases[i] = dot.flickerPhase;
        isFlickeringArray[i] = dot.isFlickering ? 1.0 : 0.0;
      });

      staticDataRef.current = {
        positions,
        opacities,
        flickerPhases,
        isFlickeringArray,
        initialized: true,
        needsOpacityUpdate: true,
      };
    },
    [opacity],
  );

  const cleanupBuffers = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;

    Object.values(buffersRef.current).forEach((buffer) => {
      if (buffer) {
        gl.deleteBuffer(buffer);
      }
    });
    buffersRef.current = {};
    staticDataRef.current.initialized = false;
  }, []);

  const render = useCallback(
    (time: number) => {
      const gl = glRef.current;
      const program = programRef.current;
      const canvas = canvasRef.current;

      if (time - lastFrameTimeRef.current < frameInterval) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = time;

      if (!gl || !program || !canvas || !isInView || !isDocumentVisibleRef.current) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (dotsRef.current.length === 0) {
        dotsRef.current = generateDots(canvas.width, canvas.height);
      }
      const dots = dotsRef.current;

      if (!staticDataRef.current.initialized) {
        initializeStaticData(dots);
      }

      const { positions, opacities, flickerPhases, isFlickeringArray } = staticDataRef.current;
      if (!positions || !opacities || !flickerPhases || !isFlickeringArray) return;

      if (staticDataRef.current.needsOpacityUpdate) {
        dots.forEach((dot, i) => {
          opacities[i] = dot.opacity * opacity;
        });
        staticDataRef.current.needsOpacityUpdate = false;
      }

      if (!buffersRef.current.position) {
        buffersRef.current.position = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.position);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      }
      const positionLocation = gl.getAttribLocation(program, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.position);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      if (!buffersRef.current.opacity) {
        buffersRef.current.opacity = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.opacity);
        gl.bufferData(gl.ARRAY_BUFFER, opacities, gl.DYNAMIC_DRAW);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.opacity);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, opacities);
      }
      const opacityLocation = gl.getAttribLocation(program, "a_opacity");
      gl.enableVertexAttribArray(opacityLocation);
      gl.vertexAttribPointer(opacityLocation, 1, gl.FLOAT, false, 0, 0);

      if (!buffersRef.current.flickerPhase) {
        buffersRef.current.flickerPhase = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.flickerPhase);
        gl.bufferData(gl.ARRAY_BUFFER, flickerPhases, gl.STATIC_DRAW);
      }
      const flickerPhaseLocation = gl.getAttribLocation(program, "a_flickerPhase");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.flickerPhase);
      gl.enableVertexAttribArray(flickerPhaseLocation);
      gl.vertexAttribPointer(flickerPhaseLocation, 1, gl.FLOAT, false, 0, 0);

      if (!buffersRef.current.isFlickering) {
        buffersRef.current.isFlickering = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.isFlickering);
        gl.bufferData(gl.ARRAY_BUFFER, isFlickeringArray, gl.STATIC_DRAW);
      }
      const isFlickeringLocation = gl.getAttribLocation(program, "a_isFlickering");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.isFlickering);
      gl.enableVertexAttribArray(isFlickeringLocation);
      gl.vertexAttribPointer(isFlickeringLocation, 1, gl.FLOAT, false, 0, 0);

      const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

      const timeLocation = gl.getUniformLocation(program, "u_time");
      gl.uniform1f(timeLocation, time * 0.001 * flickeringSpeed);

      const dotSizeLocation = gl.getUniformLocation(program, "u_dotSize");
      gl.uniform1f(dotSizeLocation, dotSize);

      const colorLocation = gl.getUniformLocation(program, "u_color");
      if (!staticDataRef.current.color) {
        const hex = grayDark.gray11.replace("#", "");
        staticDataRef.current.color = [
          parseInt(hex.substr(0, 2), 16) / 255,
          parseInt(hex.substr(2, 2), 16) / 255,
          parseInt(hex.substr(4, 2), 16) / 255,
        ];
      }
      const [r, g, b] = staticDataRef.current.color;
      gl.uniform3f(colorLocation, r, g, b);

      gl.drawArrays(gl.POINTS, 0, dots.length);

      animationRef.current = requestAnimationFrame(render);
    },
    [
      generateDots,
      opacity,
      flickeringSpeed,
      dotSize,
      isInView,
      initializeStaticData,
      frameInterval,
    ],
  );

  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const newWidth = width || container.clientWidth;
    const newHeight = height || container.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;

    setCanvasSize({ width: newWidth, height: newHeight });

    dotsRef.current = [];
    cleanupBuffers();
  }, [width, height, cleanupBuffers]);

  const handleVisibilityChange = useCallback(() => {
    isDocumentVisibleRef.current = !document.hidden;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    updateCanvasSize();

    if (!setupWebGL()) return;

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanupBuffers();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [setupWebGL, updateCanvasSize, cleanupBuffers, handleVisibilityChange]);

  useEffect(() => {
    const handleResize = () => {
      updateCanvasSize();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateCanvasSize]);

  useEffect(() => {
    if (isInView && isDocumentVisibleRef.current) {
      animationRef.current = requestAnimationFrame(render);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isInView, render]);

  useEffect(() => {
    if (staticDataRef.current.initialized) {
      staticDataRef.current.needsOpacityUpdate = true;
    }
  }, [opacity]);

  return (
    <div ref={containerRef} className={cn("h-full w-full relative", className)} {...props}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          opacity: 0.75,
          mask: "radial-gradient(circle 380px at center, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.02) 100%)",
          WebkitMask:
            "radial-gradient(circle 380px at center, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.02) 100%)",
        }}
      />
    </div>
  );
};

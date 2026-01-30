import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MediaPlayerProps {
  src: string;
  type: 'audio' | 'video';
  poster?: string;
  mimeType?: string;
  className?: string;
  isVoiceMessage?: boolean;
  senderAvatar?: string;
  senderName?: string;
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

// Generate stable waveform bars based on src
const generateWaveformBars = (seed: string, count: number = 28) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  return Array.from({ length: count }).map((_, i) => {
    const seedVal = Math.abs(hash + i * 31);
    // Create more natural waveform pattern
    const base = 20 + (seedVal % 60);
    return base;
  });
};

export const MediaPlayer: React.FC<MediaPlayerProps> = ({ 
  src, 
  type, 
  poster, 
  mimeType, 
  className,
  isVoiceMessage = false,
  senderAvatar,
  senderName = "User"
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState(false);

  // Stable waveform bars
  const waveformBars = useMemo(() => generateWaveformBars(src), [src]);

  const mediaRef = type === 'audio' ? audioRef : videoRef;

  useEffect(() => {
    const m = mediaRef.current;
    if (!m) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(m.currentTime);
    const onDuration = () => {
      if (m.duration && isFinite(m.duration)) {
        setDuration(m.duration);
      }
    };
    const onLoaded = () => {
      setIsLoaded(true);
      setError(false);
      if (m.duration && isFinite(m.duration)) {
        setDuration(m.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => setError(true);

    m.addEventListener('play', onPlay);
    m.addEventListener('pause', onPause);
    m.addEventListener('timeupdate', onTime);
    m.addEventListener('loadedmetadata', onDuration);
    m.addEventListener('loadeddata', onLoaded);
    m.addEventListener('canplaythrough', onLoaded);
    m.addEventListener('ended', onEnded);
    m.addEventListener('error', onError);

    // Try to load duration immediately
    if (m.readyState >= 1 && m.duration && isFinite(m.duration)) {
      setDuration(m.duration);
      setIsLoaded(true);
    }

    return () => {
      m.removeEventListener('play', onPlay);
      m.removeEventListener('pause', onPause);
      m.removeEventListener('timeupdate', onTime);
      m.removeEventListener('loadedmetadata', onDuration);
      m.removeEventListener('loadeddata', onLoaded);
      m.removeEventListener('canplaythrough', onLoaded);
      m.removeEventListener('ended', onEnded);
      m.removeEventListener('error', onError);
    };
  }, [src, mediaRef]);

  useEffect(() => {
    const m = mediaRef.current;
    if (m) {
      m.volume = volume;
      m.muted = muted;
      m.playbackRate = playbackRate;
    }
  }, [volume, muted, playbackRate, mediaRef]);

  const togglePlay = async () => {
    const m = mediaRef.current;
    if (!m) return;
    
    try {
      if (m.paused) {
        await m.play();
      } else {
        m.pause();
      }
    } catch (e) {
      console.error('Error playing media:', e);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const m = mediaRef.current;
    if (!m || !isFinite(duration) || duration <= 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    m.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    setPlaybackRate(rates[nextIndex]);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // WhatsApp style audio player
  if (type === 'audio') {
    const getInitials = (name: string) => {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
      <div className={cn('w-full max-w-[280px] min-w-0', className)}>
        <audio 
          ref={audioRef} 
          src={src} 
          preload="auto"
          crossOrigin="anonymous"
        />
        
        <div className="flex items-center gap-3 p-2 rounded-xl bg-[#1f3d38] dark:bg-[#1f3d38]">
          {/* Avatar with mic icon overlay */}
          <div className="relative shrink-0">
            <Avatar className="h-11 w-11 border-2 border-[#00a884]">
              <AvatarImage src={senderAvatar} alt={senderName} />
              <AvatarFallback className="bg-[#00a884]/20 text-[#00a884] text-sm font-medium">
                {getInitials(senderName)}
              </AvatarFallback>
            </Avatar>
            {/* Mic icon overlay */}
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#00a884] flex items-center justify-center">
              <Mic className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Play/Pause button */}
          <button
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
            onClick={togglePlay}
            disabled={error}
            className={cn(
              "shrink-0 transition-all",
              "text-[#8696a0] hover:text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isPlaying ? (
              <Pause className="h-7 w-7" fill="currentColor" />
            ) : (
              <Play className="h-7 w-7" fill="currentColor" />
            )}
          </button>

          {/* Waveform and time */}
          <div className="flex-1 min-w-0">
            {/* Waveform progress bar with dot indicator */}
            <div 
              className="relative h-6 flex items-center cursor-pointer"
              onClick={handleSeek}
            >
              <div className="w-full h-full flex items-center gap-[2px]">
                {waveformBars.map((height, i) => {
                  const barProgress = ((i + 1) / waveformBars.length) * 100;
                  const isActive = barProgress <= progress;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-full transition-colors duration-75",
                        isActive ? "bg-[#00a884]" : "bg-[#8696a0]/40"
                      )}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
              {/* Progress dot indicator */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#00a884] shadow-lg transition-all"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            </div>
            
            {/* Time display */}
            <div className="flex items-center gap-2 text-[11px] text-[#8696a0] mt-0.5">
              <span>{formatTime(currentTime || duration)}</span>
              {playbackRate !== 1 && (
                <button
                  onClick={cyclePlaybackRate}
                  className="font-medium hover:text-white transition-colors px-1 py-0.5 rounded bg-[#8696a0]/20"
                >
                  {playbackRate}×
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Video player (keep similar style but improved)
  return (
    <div className={cn('w-full max-w-full min-w-0', className)}>
      <div className="relative rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full max-h-[300px] object-contain"
          controls={false}
          onClick={togglePlay}
        />
        
        {/* Play overlay */}
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center">
              <Play className="h-7 w-7 text-primary-foreground ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <button
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          onClick={togglePlay}
          className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground shrink-0"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="flex-1">
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="absolute h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setMuted(m => !m)}
            className="p-1 rounded hover:bg-muted"
            aria-label={muted ? 'Desmutar' : 'Mutar'}
          >
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaPlayer;

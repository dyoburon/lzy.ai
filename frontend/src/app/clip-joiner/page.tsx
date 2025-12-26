"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

export default function ClipJoinerPage() {
  const [video1, setVideo1] = useState<File | null>(null);
  const [video1Path, setVideo1Path] = useState("");
  const [video2, setVideo2] = useState<File | null>(null);
  const [video2Path, setVideo2Path] = useState("");

  const [uploading1, setUploading1] = useState(false);
  const [uploading2, setUploading2] = useState(false);
  const [uploadProgress1, setUploadProgress1] = useState(0);
  const [uploadProgress2, setUploadProgress2] = useState(0);

  const [joining, setJoining] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");

  const fileInput1Ref = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const uploadVideo = async (
    file: File,
    setPath: (path: string) => void,
    setUploading: (uploading: boolean) => void,
    setProgress: (progress: number) => void
  ): Promise<boolean> => {
    setUploading(true);
    setProgress(0);
    setError("");

    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setProgress(progress);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          setPath(data.video_path);
          resolve(true);
        } else {
          const data = JSON.parse(xhr.responseText);
          setError(data.error || "Upload failed");
          resolve(false);
        }
      };

      xhr.onerror = () => {
        setError("Upload failed. Make sure the backend is running.");
        setUploading(false);
        resolve(false);
      };

      xhr.open("POST", `${API_URL}/api/join/upload`);
      xhr.send(formData);
    });
  };

  const handleFile1Select = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideo1(file);
    await uploadVideo(file, setVideo1Path, setUploading1, setUploadProgress1);
    e.target.value = "";
  };

  const handleFile2Select = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideo2(file);
    await uploadVideo(file, setVideo2Path, setUploading2, setUploadProgress2);
    e.target.value = "";
  };

  const handleJoin = async () => {
    if (!video1Path || !video2Path) return;

    setJoining(true);
    setError("");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl("");
    }

    try {
      const response = await fetch(`${API_URL}/api/join/concatenate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path_1: video1Path,
          video_path_2: video2Path,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        // Convert base64 to blob URL
        const byteCharacters = atob(data.video_data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "video/mp4" });
        const blobUrl = URL.createObjectURL(blob);
        setResultUrl(blobUrl);
      }
    } catch {
      setError("Failed to connect to server. Make sure the backend is running.");
    } finally {
      setJoining(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;

    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "joined_video.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setVideo1(null);
    setVideo1Path("");
    setVideo2(null);
    setVideo2Path("");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl("");
    }
    setError("");
  };

  const canJoin = video1Path && video2Path && !uploading1 && !uploading2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-700/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold text-white">
              lzy<span className="text-purple-500">.ai</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Clip Joiner</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">Clip Joiner</h1>
          <p className="text-zinc-400">
            Upload two shorts and join them together into one video.
          </p>
        </div>

        {!resultUrl ? (
          <div className="space-y-6">
            {/* Video Upload Cards */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Video 1 */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <label className="block text-sm font-medium text-white mb-3">
                  First Video
                </label>
                <input
                  ref={fileInput1Ref}
                  type="file"
                  accept="video/*"
                  onChange={handleFile1Select}
                  className="hidden"
                  disabled={uploading1}
                />
                <div
                  onClick={() => !uploading1 && fileInput1Ref.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    uploading1
                      ? "border-zinc-700 cursor-not-allowed"
                      : "border-zinc-600 cursor-pointer hover:border-purple-500"
                  }`}
                >
                  {uploading1 ? (
                    <div>
                      <div className="text-purple-400 mb-2">
                        Uploading... {uploadProgress1}%
                      </div>
                      <div className="w-full bg-zinc-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress1}%` }}
                        />
                      </div>
                    </div>
                  ) : video1 ? (
                    <div>
                      <div className="text-green-400 mb-1">Uploaded</div>
                      <div className="text-zinc-500 text-sm truncate">{video1.name}</div>
                    </div>
                  ) : (
                    <div>
                      <svg
                        className="w-10 h-10 mx-auto mb-2 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <div className="text-zinc-400">Click to upload</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Video 2 */}
              <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <label className="block text-sm font-medium text-white mb-3">
                  Second Video
                </label>
                <input
                  ref={fileInput2Ref}
                  type="file"
                  accept="video/*"
                  onChange={handleFile2Select}
                  className="hidden"
                  disabled={uploading2}
                />
                <div
                  onClick={() => !uploading2 && fileInput2Ref.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    uploading2
                      ? "border-zinc-700 cursor-not-allowed"
                      : "border-zinc-600 cursor-pointer hover:border-purple-500"
                  }`}
                >
                  {uploading2 ? (
                    <div>
                      <div className="text-purple-400 mb-2">
                        Uploading... {uploadProgress2}%
                      </div>
                      <div className="w-full bg-zinc-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress2}%` }}
                        />
                      </div>
                    </div>
                  ) : video2 ? (
                    <div>
                      <div className="text-green-400 mb-1">Uploaded</div>
                      <div className="text-zinc-500 text-sm truncate">{video2.name}</div>
                    </div>
                  ) : (
                    <div>
                      <svg
                        className="w-10 h-10 mx-auto mb-2 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <div className="text-zinc-400">Click to upload</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Join Button */}
            <button
              onClick={handleJoin}
              disabled={!canJoin || joining}
              className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {joining ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Joining videos...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Join Videos
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Result */}
            <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
              <h2 className="text-xl font-bold text-white mb-4">Joined Video</h2>

              <div className="aspect-[9/16] max-w-sm mx-auto bg-black rounded-lg overflow-hidden mb-4">
                <video src={resultUrl} controls className="w-full h-full object-contain" />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download
                </button>
                <button
                  onClick={handleReset}
                  className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
                >
                  Join More
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

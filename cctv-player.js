    <script>
      let currentStreamType = null;
      let streamStartTime = null;
      let streamDuration = 150; // Default 150 seconds for temporary streams
      let streamTimer = null;
      let hls = null;
      
      // Helper function to get query string parameters
      function queryString(name) {
        var AllVars = window.location.search.substring(1);
        var Vars = AllVars.split("&");
        for (i = 0; i < Vars.length; i++) {
          var Var = Vars[i].split("=");
          if (Var[0] == name) return Var[1];
        }
        return "";
      }
      
      // Show error message
      function showError(message) {
        $("#video").remove();
        $("#loader").remove();
        $("#stream-info").remove();
        $("#container").html(
          `<div id="error-container">
            <span id="error-message">${message}</span>
          </div>`
        );
      }
      
      // Show disconnected camera image
      function showDisconnected() {
        $("#video").remove();
        $("#loader").remove();
        $("#stream-info").remove();
        $("#container").html(
          `<div style="width:720px; height:480px;">
            <img src="./images/disconnect.jpg" />
          </div>`
        );
      }
      
      // Update stream info display
      function updateStreamInfo(streamType, cameraName) {
        const isLongTerm = streamType === 'long_term';
        const indicator = isLongTerm ?
          '<span class="long-term-indicator">長期串流</span>' :
          '<span class="temporary-indicator">臨時串流 (150秒)</span>';

        let infoHtml = `<div><strong>攝影機:</strong> ${cameraName} ${indicator}</div>`;
        if (!isLongTerm) {
          infoHtml += `<div><strong>剩餘時間:</strong> <span id="time-remaining">${streamDuration}秒</span></div>`;
        }
        //$("#stream-info").html(infoHtml).show();

        startStreamTimer();
      }
      
      // Start countdown timer for temporary streams
      function startStreamTimer() {
        if (streamTimer) {
          clearInterval(streamTimer);
        }
        
        streamStartTime = Date.now();
        
        streamTimer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - streamStartTime) / 1000);
          const remaining = Math.max(0, streamDuration - elapsed);
          
          $("#time-remaining").text(remaining + "秒");
          
          if (remaining <= 0) {
            clearInterval(streamTimer);
			
			const video = document.getElementById('video');
			if (video) {
				// Stop the video
				video.pause();
				
				// Disable all controls (play, pause, seek, volume, etc.)
				video.controls = false;
				
				// Prevent any mouse/keyboard interaction
				video.style.pointerEvents = 'none';
				
				// Optional: Dim the video to show it's disabled
				video.style.filter = 'brightness(0.7)';
			}
			
			if (hls) {
				hls.stopLoad();
			}

          }
        }, 1000);
      }
      
      // Simple POST request helper
      function postRequest(endpoint, data) {
        return new Promise((resolve, reject) => {
          $.ajax({
            url: '../api/' + endpoint,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(data),
            success: function(response) {
              resolve(response);
            },
            error: function(xhr) {
              reject(xhr);
            }
          });
        });
      }
      
      // Single call: StreamHub returns fqid, name, state, isLongTerm, longTermPath
      function getCameraInfo(ccd_id) {
        return new Promise((resolve, reject) => {
          $.getJSON('./_api/camera/by-ccd/' + ccd_id, function(data) {
            resolve(data);
          }).fail(function(xhr) {
            reject(xhr);
          });
        });
      }

      // fqid and name come from getCameraInfo; PHP initVideoWithIP no longer re-reads JSON
      function initVideoWithIP(fqid, ccd_id, name) {
        return new Promise((resolve, reject) => {
          postRequest('initVideoWithIP', { fqid, ccd_id, name })
            .then(data => resolve(data[0]))
            .catch(reject);
        });
      }
      
      // Poll for video status until ready
      function pollVideoStatus(ccd_id, maxAttempts = 30, interval = 2000) {
        return new Promise((resolve, reject) => {
          let attempts = 0;
          
          const checkStatus = () => {
            postRequest('checkVideoStatus', { ccd_id: ccd_id })
              .then(data => {
                if (data.status === 'ready') {
                  resolve(data);
                } else if (attempts >= maxAttempts) {
                  reject(new Error('Timeout waiting for video conversion'));
                } else {
                  attempts++;
                  setTimeout(checkStatus, interval);
                }
              })
              .catch(reject);
          };
          
          checkStatus();
        });
      }
      
      function playVideo(videoPath, cameraName, streamType) {
        document.title = cameraName;
        var video = document.getElementById('video');

        currentStreamType = streamType;

        $("#loader").hide();
        $("#video").show();

        updateStreamInfo(streamType, cameraName);

        if (hls) {
          hls.destroy();
        }
        
        if (Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 4,
            maxMaxBufferLength: 8,
            maxBufferSize: 60 * 1000 * 1000,
            maxBufferHole: 0.1,
            lowLatencyMode: false,
            backBufferLength: 0,
            liveSyncDurationCount: 2,
            fragLoadingMaxRetry: 6,
            highBufferWatchdogPeriod: 5
          });

          hls.loadSource(videoPath);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, function() {
            video.play();
          });

          hls.on(Hls.Events.ERROR, function(event, data) {
            if (data.fatal) {
              hls.destroy();
              if (streamType === 'long_term') {
                showError('長期串流發生錯誤，請聯繫管理員');
              } else {
                showError('影片串流錯誤，請刷新頁面重試');
              }
            }
          });
          
          
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoPath;
          video.addEventListener('loadedmetadata', function() {
            video.play();
          });
        }
      }
      
      async function initializeVideo() {
        const params = new URLSearchParams(window.location.search);
        for (const key of params.keys()) {
          if (key !== 'id') {
            showError('攝影機編號無效');
            return;
          }
        }

        const ccd_id = queryString("id");
        if (!ccd_id) {
          showError('未指定攝影機編號');
          return;
        }
        if (!/^(?!000)\d{3}$/.test(ccd_id)) {
          showError('攝影機編號無效');
          return;
        }

        try {
          $("#video").hide();
          $("#loader").show();
          $("#stream-info").hide();

          // Single call to StreamHub: returns fqid, name, state (+ isLongTerm, longTermPath)
          const cameraData = await getCameraInfo(ccd_id);

          if (!cameraData || cameraData.fqid === 'unKnown') {
            showError('無此攝影機');
            return;
          }

          if (cameraData.state !== 'Responding') {
            switch (cameraData.state) {
              case 'Not Responding': showDisconnected(); break;
              case 'cancel': showError('攝影機暫不開放'); break;
              default: showError('攝影機狀態異常');
            }
            return;
          }

          // Long-term stream: play directly when StreamHub provides the path
          if (cameraData.isLongTerm && cameraData.longTermPath) {
            $("#message").text('使用長期串流中...');
            playVideo(cameraData.longTermPath, cameraData.name, 'long_term');
            return;
          }

          // Temporary stream: PHP decides whether to restart based on remaining time
          const initData = await initVideoWithIP(cameraData.fqid, ccd_id, cameraData.name);
          $("#message").text('正在準備臨時串流，請稍候...');

          if (initData.Duration) {
            streamDuration = initData.Duration;
          }

          const videoStatusData = await pollVideoStatus(ccd_id);
          playVideo(videoStatusData.path, cameraData.name, 'temporary');

        } catch (error) {
          console.error('Error:', error);
          if (error.status === 429) { showError('請求次數過多，請稍後再試'); }
          else if (error.status === 405) { showError('請求方法錯誤'); }
          else if (error.status === 403) { showError('存取被拒絕'); }
          else if (error.message && error.message.includes('Timeout')) { showError('串流準備超時，請重新整理頁面'); }
          else { showError('初始化失敗，請刷新頁面重試'); }
        }
      }
      
      // Enhanced: Cleanup on page unload
      window.addEventListener('beforeunload', function() {
        if (streamTimer) {
          clearInterval(streamTimer);
        }
        if (hls) {
          hls.destroy();
        }
      });
      
      // Enhanced: Add keyboard shortcuts
      document.addEventListener('keydown', function(e) {
        if (e.key === 'r' || e.key === 'R') {
          // R key to refresh/restart stream
          location.reload();
        }
      });
      
      // Start the application
      $(document).ready(function() {
        initializeVideo();
      });
    </script>

#!/bin/bash
# =============================================================================
# media-processor-rs Server API Test Script
# =============================================================================
# Usage: ./test_server.sh [port] [test_video.mp4]
# Prerequisites: Server must be running (vedit-server serve --port <port>)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0
SKIPPED=0

# Configuration
PORT="${1:-8765}"
BASE_URL="http://127.0.0.1:$PORT"
TEST_VIDEO="${2:-/path/to/test_video.mp4}"
OUTPUT_DIR="./test_output"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((SKIPPED++))
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Extract HTTP code and body from curl response
# Usage: extract_response "$response"
# Sets: http_code, body
extract_response() {
    local response="$1"
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
}

check_server() {
    log_info "Checking server at $BASE_URL..."
    if curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null 2>&1; then
        log_info "Server is running"
        return 0
    else
        echo -e "${RED}Error: Server not running at $BASE_URL${NC}"
        echo "Please start the server first: vedit-server serve --port $PORT"
        exit 1
    fi
}

setup_test_env() {
    mkdir -p "$OUTPUT_DIR"
    log_info "Test output directory: $OUTPUT_DIR"
}

cleanup() {
    if [ -d "$OUTPUT_DIR" ]; then
        rm -rf "$OUTPUT_DIR"
        log_info "Cleaned up test output directory"
    fi
}

# =============================================================================
# Test: Health Check
# =============================================================================

test_health_check() {
    log_info "Testing: GET /health"
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        log_pass "GET /health (status: $http_code)"
    else
        log_fail "GET /health (status: $http_code, expected: 200)"
    fi
}

# =============================================================================
# Test: Export API
# =============================================================================

test_export_start() {
    log_info "Testing: POST /export/start"

    job_id="test-job-$(date +%s)"
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/export/start" \
        -H "Content-Type: application/json" \
        -d "{
            \"jobId\": \"$job_id\",
            \"outputPath\": \"$OUTPUT_DIR/export_test.mp4\",
            \"settings\": {
                \"width\": 1920,
                \"height\": 1080,
                \"fps\": 30.0,
                \"videoCodec\": \"h264\",
                \"videoBitrate\": 5000000,
                \"audioCodec\": \"aac\",
                \"audioBitrate\": 128000
            },
            \"timeline\": {
                \"duration\": 5.0,
                \"tracks\": []
            }
        }")

    extract_response "$response"

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        if echo "$body" | grep -q "jobId"; then
            log_pass "POST /export/start (status: $http_code)"
            echo "$job_id" > "$OUTPUT_DIR/last_job_id.txt"
        else
            log_fail "POST /export/start (missing jobId in response)"
        fi
    else
        log_fail "POST /export/start (status: $http_code)"
    fi
}

test_export_status() {
    log_info "Testing: GET /export/status/:job_id"

    if [ ! -f "$OUTPUT_DIR/last_job_id.txt" ]; then
        log_skip "GET /export/status (no job_id available)"
        return
    fi

    job_id=$(cat "$OUTPUT_DIR/last_job_id.txt")
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/export/status/$job_id")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        if echo "$body" | grep -q "progress\|state"; then
            log_pass "GET /export/status/:job_id (status: $http_code)"
        else
            log_fail "GET /export/status/:job_id (invalid response format)"
        fi
    else
        log_fail "GET /export/status/:job_id (status: $http_code)"
    fi
}

test_export_cancel() {
    log_info "Testing: POST /export/cancel/:job_id"

    if [ ! -f "$OUTPUT_DIR/last_job_id.txt" ]; then
        log_skip "POST /export/cancel (no job_id available)"
        return
    fi

    job_id=$(cat "$OUTPUT_DIR/last_job_id.txt")
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/export/cancel/$job_id")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        log_pass "POST /export/cancel/:job_id (status: $http_code)"
    else
        # Cancel may fail if job already completed, which is acceptable
        log_skip "POST /export/cancel/:job_id (status: $http_code, job may have completed)"
    fi
}

test_export_status_nonexistent() {
    log_info "Testing: GET /export/status with nonexistent job"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/export/status/nonexistent-job-12345")
    extract_response "$response"

    if [ "$http_code" = "404" ] || [ "$http_code" = "400" ]; then
        log_pass "GET /export/status handles nonexistent job (status: $http_code)"
    else
        log_fail "GET /export/status nonexistent (status: $http_code, expected: 404 or 400)"
    fi
}

# =============================================================================
# Test: Keyframe Cache API
# =============================================================================

test_keyframes_status() {
    log_info "Testing: GET /keyframes/status"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/keyframes/status")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        log_pass "GET /keyframes/status (status: $http_code)"
    else
        log_fail "GET /keyframes/status (status: $http_code)"
    fi
}

test_keyframes_warmup() {
    log_info "Testing: POST /keyframes/warmup"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "POST /keyframes/warmup (test video not found: $TEST_VIDEO)"
        return
    fi

    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/keyframes/warmup" \
        -H "Content-Type: application/json" \
        -d "{
            \"playhead\": 5.0,
            \"maxFrames\": 10,
            \"sources\": [{\"path\": \"$TEST_VIDEO\", \"priority\": 1}]
        }")

    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        log_pass "POST /keyframes/warmup (status: $http_code)"
    else
        log_fail "POST /keyframes/warmup (status: $http_code)"
    fi
}

test_keyframes_seek() {
    log_info "Testing: POST /keyframes/seek"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "POST /keyframes/seek (test video not found: $TEST_VIDEO)"
        return
    fi

    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/keyframes/seek" \
        -H "Content-Type: application/json" \
        -d "{
            \"sourcePath\": \"$TEST_VIDEO\",
            \"targetTime\": 10.0
        }")

    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        log_pass "POST /keyframes/seek (status: $http_code)"
    else
        log_fail "POST /keyframes/seek (status: $http_code)"
    fi
}

test_keyframes_idr() {
    log_info "Testing: GET /keyframes/idr"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "GET /keyframes/idr (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/keyframes/idr?source=$encoded_path")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        if echo "$body" | grep -q "idrFrames"; then
            log_pass "GET /keyframes/idr (status: $http_code)"
        else
            log_fail "GET /keyframes/idr (invalid response format)"
        fi
    else
        log_fail "GET /keyframes/idr (status: $http_code)"
    fi
}

test_keyframes_clear() {
    log_info "Testing: POST /keyframes/clear"

    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/keyframes/clear")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        log_pass "POST /keyframes/clear (status: $http_code)"
    else
        log_fail "POST /keyframes/clear (status: $http_code)"
    fi
}

# =============================================================================
# Test: Frame Extraction API
# =============================================================================

test_frame_extract() {
    log_info "Testing: GET /frame/extract"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "GET /frame/extract (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    output_file="$OUTPUT_DIR/frame_extract.jpg"

    http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        "$BASE_URL/frame/extract?source=$encoded_path&time=1.0&quality=85")

    if [ "$http_code" = "200" ]; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "GET /frame/extract (status: $http_code)"
        else
            log_fail "GET /frame/extract (output file empty)"
        fi
    else
        log_fail "GET /frame/extract (status: $http_code)"
    fi
}

test_frame_composite() {
    log_info "Testing: POST /frame/composite"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "POST /frame/composite (test video not found: $TEST_VIDEO)"
        return
    fi

    output_file="$OUTPUT_DIR/frame_composite.jpg"

    http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        -X POST "$BASE_URL/frame/composite" \
        -H "Content-Type: application/json" \
        -d "{
            \"width\": 1920,
            \"height\": 1080,
            \"layers\": [
                {\"source\": \"$TEST_VIDEO\", \"time\": 1.0, \"opacity\": 1.0}
            ],
            \"quality\": 85
        }")

    if [ "$http_code" = "200" ]; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "POST /frame/composite (status: $http_code)"
        else
            log_fail "POST /frame/composite (output file empty)"
        fi
    else
        log_fail "POST /frame/composite (status: $http_code)"
    fi
}

# =============================================================================
# Test: Media Probe API
# =============================================================================

test_probe_json() {
    log_info "Testing: GET /probe (JSON format)"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "GET /probe JSON (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/probe?source=$encoded_path")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        # Check for expected JSON fields
        if echo "$body" | grep -q "duration" && echo "$body" | grep -q "format"; then
            log_pass "GET /probe JSON (status: $http_code)"
            # Save response for inspection
            echo "$body" > "$OUTPUT_DIR/probe_response.json"
        else
            log_fail "GET /probe JSON (missing expected fields)"
        fi
    else
        log_fail "GET /probe JSON (status: $http_code)"
    fi
}

test_probe_text() {
    log_info "Testing: GET /probe (text format)"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "GET /probe text (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/probe?source=$encoded_path&format=text")
    extract_response "$response"

    if [ "$http_code" = "200" ]; then
        # Check for expected text format fields
        if echo "$body" | grep -q "File:" && echo "$body" | grep -q "Duration:"; then
            log_pass "GET /probe text (status: $http_code)"
            # Save response for inspection
            echo "$body" > "$OUTPUT_DIR/probe_response.txt"
        else
            log_fail "GET /probe text (missing expected fields)"
        fi
    else
        log_fail "GET /probe text (status: $http_code)"
    fi
}

test_probe_video_info() {
    log_info "Testing: GET /probe video stream info"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "GET /probe video info (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s "$BASE_URL/probe?source=$encoded_path")

    # Check for video stream info
    if echo "$response" | grep -q '"video"' && echo "$response" | grep -q '"codec"'; then
        log_pass "GET /probe contains video stream info"
    else
        log_fail "GET /probe missing video stream info"
    fi
}

test_probe_audio_info() {
    log_info "Testing: GET /probe audio stream info"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "GET /probe audio info (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s "$BASE_URL/probe?source=$encoded_path")

    # Check for audio stream info (if video has audio)
    if echo "$response" | grep -q '"audio"'; then
        log_pass "GET /probe contains audio stream info"
    else
        log_skip "GET /probe no audio stream (video may not have audio)"
    fi
}

test_probe_nonexistent_file() {
    log_info "Testing: GET /probe with nonexistent file"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/probe?source=/nonexistent/video.mp4")
    extract_response "$response"

    if [ "$http_code" = "404" ]; then
        if echo "$body" | grep -q "error"; then
            log_pass "GET /probe nonexistent file returns 404 with error"
        else
            log_fail "GET /probe nonexistent file (missing error message)"
        fi
    else
        log_fail "GET /probe nonexistent file (status: $http_code, expected: 404)"
    fi
}

test_probe_missing_source() {
    log_info "Testing: GET /probe without source parameter"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/probe")
    extract_response "$response"

    if [ "$http_code" = "400" ] || [ "$http_code" = "422" ]; then
        log_pass "GET /probe missing source returns error (status: $http_code)"
    else
        log_fail "GET /probe missing source (status: $http_code, expected: 400 or 422)"
    fi
}

# =============================================================================
# Test: Error Handling
# =============================================================================

test_invalid_endpoint() {
    log_info "Testing: Invalid endpoint"

    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/invalid/endpoint/12345")
    extract_response "$response"

    if [ "$http_code" = "404" ]; then
        log_pass "Invalid endpoint returns 404"
    else
        log_fail "Invalid endpoint (status: $http_code, expected: 404)"
    fi
}

test_invalid_json() {
    log_info "Testing: Invalid JSON body"

    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/export/start" \
        -H "Content-Type: application/json" \
        -d "invalid json {{{")
    extract_response "$response"

    if [ "$http_code" = "400" ] || [ "$http_code" = "422" ]; then
        log_pass "Invalid JSON returns error (status: $http_code)"
    else
        log_fail "Invalid JSON (status: $http_code, expected: 400 or 422)"
    fi
}

# =============================================================================
# Test: Output Quality Detection via API
# =============================================================================

# Check if ImageMagick is available
has_imagemagick() {
    command -v convert &> /dev/null
}

# Check if ffmpeg is available
has_ffmpeg() {
    command -v ffmpeg &> /dev/null
}

# Test frame extraction and black frame detection
test_frame_black_detection() {
    log_info "Testing: Frame black detection via API"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "frame black detection (test video not found: $TEST_VIDEO)"
        return
    fi

    if ! has_imagemagick; then
        log_skip "frame black detection (ImageMagick not installed)"
        return
    fi

    # Extract frame via API
    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    output_file="$OUTPUT_DIR/frame_black_api.jpg"

    http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        "$BASE_URL/frame/extract?source=$encoded_path&time=1.0&quality=85")

    if [ "$http_code" != "200" ]; then
        log_fail "frame black detection (API returned: $http_code)"
        return
    fi

    if [ ! -f "$output_file" ] || [ ! -s "$output_file" ]; then
        log_fail "frame black detection (output file empty)"
        return
    fi

    # Check brightness using ImageMagick
    brightness=$(convert "$output_file" -colorspace Gray -format "%[fx:mean]" info: 2>/dev/null)

    if [ -z "$brightness" ]; then
        log_fail "frame black detection (failed to analyze)"
        return
    fi

    is_black=$(echo "$brightness < 0.01" | bc -l 2>/dev/null || echo "0")

    if [ "$is_black" = "1" ]; then
        log_fail "frame black detection (BLACK FRAME, brightness: $brightness)"
    else
        log_pass "frame black detection (brightness: $brightness)"
    fi
}

# Test file size via probe API
test_probe_file_size() {
    log_info "Testing: File size detection via probe API"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "file size detection (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s "$BASE_URL/probe?source=$encoded_path")

    # Extract duration and bitrate from probe response
    duration=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('duration', 0))" 2>/dev/null)
    video_bitrate=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('video',{}); print(v.get('bitrate', 0))" 2>/dev/null)

    if [ -z "$duration" ] || [ "$duration" = "0" ]; then
        log_fail "file size detection (failed to get duration)"
        return
    fi

    log_info "  Duration: $duration seconds"
    log_info "  Video bitrate: $video_bitrate bps"

    # Check if bitrate is reasonable
    if [ -n "$video_bitrate" ] && [ "$video_bitrate" -gt 0 ]; then
        log_pass "file size detection (bitrate: ${video_bitrate}bps)"
    else
        log_skip "file size detection (bitrate not available in probe)"
    fi
}

# Test audio info via probe API
test_probe_audio_volume_info() {
    log_info "Testing: Audio info via probe API"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "audio info (test video not found: $TEST_VIDEO)"
        return
    fi

    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    response=$(curl -s "$BASE_URL/probe?source=$encoded_path")

    # Check for audio info
    has_audio=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'audio' in d else 'no')" 2>/dev/null)

    if [ "$has_audio" = "yes" ]; then
        audio_codec=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('audio',{}).get('codec','unknown'))" 2>/dev/null)
        audio_bitrate=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('audio',{}).get('bitrate',0))" 2>/dev/null)
        audio_channels=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('audio',{}).get('channels',0))" 2>/dev/null)

        log_info "  Audio codec: $audio_codec"
        log_info "  Audio bitrate: $audio_bitrate bps"
        log_info "  Audio channels: $audio_channels"

        if [ -n "$audio_bitrate" ] && [ "$audio_bitrate" -gt 0 ]; then
            log_pass "audio info (codec: $audio_codec, bitrate: ${audio_bitrate}bps)"
        else
            log_pass "audio info (codec: $audio_codec)"
        fi
    else
        log_skip "audio info (no audio track in video)"
    fi
}

# Test composite frame for tearing (basic check)
test_composite_quality() {
    log_info "Testing: Composite frame quality"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "composite quality (test video not found: $TEST_VIDEO)"
        return
    fi

    output_file="$OUTPUT_DIR/composite_quality.jpg"

    http_code=$(curl -s -w "%{http_code}" -o "$output_file" \
        -X POST "$BASE_URL/frame/composite" \
        -H "Content-Type: application/json" \
        -d "{
            \"width\": 1920,
            \"height\": 1080,
            \"layers\": [
                {\"source\": \"$TEST_VIDEO\", \"time\": 1.0, \"opacity\": 1.0}
            ],
            \"quality\": 90
        }")

    if [ "$http_code" != "200" ]; then
        log_fail "composite quality (API returned: $http_code)"
        return
    fi

    if [ ! -f "$output_file" ] || [ ! -s "$output_file" ]; then
        log_fail "composite quality (output file empty)"
        return
    fi

    # Check file size (should be reasonable for 1920x1080 JPEG at quality 90)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        file_size=$(stat -f%z "$output_file" 2>/dev/null)
    else
        file_size=$(stat -c%s "$output_file" 2>/dev/null)
    fi

    # Expect at least 50KB for a 1080p JPEG
    if [ "$file_size" -gt 50000 ]; then
        log_pass "composite quality (file size: ${file_size} bytes)"
    else
        log_fail "composite quality (file too small: ${file_size} bytes)"
    fi
}

# =============================================================================
# Test: System Resource Detection
# =============================================================================

# CPU usage thresholds
CPU_THRESHOLD_SYSTEM=80    # System-wide CPU threshold
CPU_THRESHOLD_PROCESS=10   # Process CPU threshold for GPU acceleration check (full GPU pipeline should be <10%)

# Get system CPU usage
get_system_cpu_usage() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//'
    else
        top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//'
    fi
}

# Get process CPU usage by name
get_server_cpu_usage() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ps aux | grep "vedit-server" | grep -v grep | head -1 | awk '{print $3}'
    else
        ps aux | grep "vedit-server" | grep -v grep | head -1 | awk '{print $3}'
    fi
}

# Test system CPU usage
test_system_cpu_usage() {
    log_info "Testing: System CPU usage detection"

    cpu_usage=$(get_system_cpu_usage)

    if [ -z "$cpu_usage" ]; then
        log_fail "system CPU usage (failed to get CPU usage)"
        return
    fi

    log_info "  System CPU usage: ${cpu_usage}%"
    log_info "  Threshold: ${CPU_THRESHOLD_SYSTEM}%"

    is_overloaded=$(echo "$cpu_usage > $CPU_THRESHOLD_SYSTEM" | bc -l 2>/dev/null || echo "0")

    if [ "$is_overloaded" = "1" ]; then
        log_fail "system CPU usage (CPU overloaded: ${cpu_usage}%)"
        echo -e "${RED}  ERROR: CPU usage too high. Operations disabled:${NC}"
        echo "    - Preview: DISABLED"
        echo "    - Export: DISABLED"
        echo "    - Composite: DISABLED"
    else
        log_pass "system CPU usage (${cpu_usage}%)"
    fi
}

# Test GPU availability
test_gpu_availability() {
    log_info "Testing: GPU availability detection"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        gpu_info=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset Model|Metal Support")

        if [ -z "$gpu_info" ]; then
            log_fail "GPU availability (no GPU detected)"
            return
        fi

        gpu_name=$(echo "$gpu_info" | grep "Chipset Model" | head -1 | sed 's/.*Chipset Model: //')
        metal_support=$(echo "$gpu_info" | grep "Metal Support" | head -1 | sed 's/.*Metal Support: //')

        log_info "  GPU: $gpu_name"
        log_info "  Metal: $metal_support"

        if [ -n "$gpu_name" ]; then
            log_pass "GPU availability ($gpu_name)"
        else
            log_fail "GPU availability (no GPU name found)"
        fi
    else
        if command -v lspci &> /dev/null; then
            gpu_info=$(lspci | grep -i "vga\|3d\|display" | head -1)
            if [ -n "$gpu_info" ]; then
                log_pass "GPU availability ($gpu_info)"
            else
                log_fail "GPU availability (no GPU detected)"
            fi
        else
            log_skip "GPU availability (lspci not available)"
        fi
    fi
}

# Test memory usage
test_memory_usage() {
    log_info "Testing: Memory usage detection"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        total_mem=$(sysctl -n hw.memsize 2>/dev/null)
        page_size=$(vm_stat | head -1 | awk '{print $8}')
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')

        if [ -z "$total_mem" ] || [ -z "$free_pages" ] || [ -z "$page_size" ]; then
            log_fail "memory usage (failed to get memory info)"
            return
        fi

        free_mem=$((free_pages * page_size))
        used_mem=$((total_mem - free_mem))
        usage_percent=$((used_mem * 100 / total_mem))

        total_gb=$(echo "scale=2; $total_mem / 1024 / 1024 / 1024" | bc -l)
        free_gb=$(echo "scale=2; $free_mem / 1024 / 1024 / 1024" | bc -l)
    else
        mem_info=$(free -b | grep Mem)
        total_mem=$(echo "$mem_info" | awk '{print $2}')
        free_mem=$(echo "$mem_info" | awk '{print $4}')
        used_mem=$(echo "$mem_info" | awk '{print $3}')
        usage_percent=$((used_mem * 100 / total_mem))

        total_gb=$(echo "scale=2; $total_mem / 1024 / 1024 / 1024" | bc -l)
        free_gb=$(echo "scale=2; $free_mem / 1024 / 1024 / 1024" | bc -l)
    fi

    log_info "  Total memory: ${total_gb} GB"
    log_info "  Free memory: ${free_gb} GB"
    log_info "  Usage: ${usage_percent}%"

    if [ "$usage_percent" -gt 90 ]; then
        log_fail "memory usage (memory low: ${usage_percent}%)"
    else
        log_pass "memory usage (${usage_percent}%)"
    fi
}

# Test VRAM detection
test_vram_detection() {
    log_info "Testing: VRAM detection"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        vram_info=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -i "VRAM")

        if [ -z "$vram_info" ]; then
            chip_info=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip")
            if echo "$chip_info" | grep -qi "Apple"; then
                log_info "  Apple Silicon - unified memory architecture"
                log_pass "VRAM detection (unified memory)"
            else
                log_skip "VRAM detection (no VRAM info available)"
            fi
        else
            vram_size=$(echo "$vram_info" | head -1 | sed 's/.*VRAM.*: //')
            log_info "  VRAM: $vram_size"
            log_pass "VRAM detection ($vram_size)"
        fi
    else
        log_skip "VRAM detection (Linux - use nvidia-smi)"
    fi
}

# Test server process CPU during API call (GPU acceleration verification)
test_server_cpu_during_api_call() {
    log_info "Testing: Server CPU during API call (GPU acceleration check)"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "server CPU during API (test video not found: $TEST_VIDEO)"
        return
    fi

    # Get server CPU before API call
    cpu_before=$(get_server_cpu_usage)

    # Make API call (frame extraction)
    encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_VIDEO', safe=''))")
    output_file="$OUTPUT_DIR/gpu_check_frame.jpg"

    # Start API call in background and monitor CPU
    curl -s -o "$output_file" "$BASE_URL/frame/extract?source=$encoded_path&time=1.0&quality=85" &
    curl_pid=$!

    # Sample CPU during operation
    max_cpu=0
    samples=0
    total_cpu=0

    while kill -0 $curl_pid 2>/dev/null; do
        server_cpu=$(get_server_cpu_usage)
        if [ -n "$server_cpu" ] && [ "$server_cpu" != "" ]; then
            current_cpu=$(echo "$server_cpu" | cut -d'.' -f1)
            if [ -n "$current_cpu" ] && [ "$current_cpu" -gt "$max_cpu" ] 2>/dev/null; then
                max_cpu=$current_cpu
            fi
            total_cpu=$((total_cpu + current_cpu))
            samples=$((samples + 1))
        fi
        sleep 0.1
    done

    wait $curl_pid 2>/dev/null

    if [ $samples -gt 0 ]; then
        avg_cpu=$((total_cpu / samples))
        log_info "  Peak server CPU: ${max_cpu}%"
        log_info "  Average server CPU: ${avg_cpu}%"
        log_info "  GPU acceleration threshold: ${CPU_THRESHOLD_PROCESS}%"

        if [ "$max_cpu" -gt "$CPU_THRESHOLD_PROCESS" ]; then
            log_fail "server CPU during API (high CPU: ${max_cpu}%)"
            echo -e "${RED}  WARNING: High CPU during GPU operation detected.${NC}"
            echo "  This indicates CPU-GPU data transfer or CPU fallback."
            echo "  Expected: Full GPU acceleration with CPU < ${CPU_THRESHOLD_PROCESS}%"
        else
            log_pass "server CPU during API (peak: ${max_cpu}%, avg: ${avg_cpu}%)"
        fi
    else
        log_skip "server CPU during API (no samples collected)"
    fi
}

# Test resource guard via API response time
test_resource_guard_api() {
    log_info "Testing: Resource guard (API availability)"

    cpu_usage=$(get_system_cpu_usage)
    cpu_ok=1
    mem_ok=1
    gpu_ok=1

    # Check CPU
    if [ -n "$cpu_usage" ]; then
        is_cpu_high=$(echo "$cpu_usage > $CPU_THRESHOLD_SYSTEM" | bc -l 2>/dev/null || echo "0")
        if [ "$is_cpu_high" = "1" ]; then
            cpu_ok=0
        fi
    fi

    # Check memory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        total_mem=$(sysctl -n hw.memsize 2>/dev/null)
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
        page_size=$(vm_stat | head -1 | awk '{print $8}')
        free_mem=$((free_pages * page_size))
        usage_percent=$((100 - free_mem * 100 / total_mem))
    else
        usage_percent=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    fi

    if [ "$usage_percent" -gt 90 ]; then
        mem_ok=0
    fi

    # Check GPU
    if [[ "$OSTYPE" == "darwin"* ]]; then
        gpu_name=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1)
        if [ -z "$gpu_name" ]; then
            gpu_ok=0
        fi
    fi

    # Determine API availability
    can_frame_extract=$((cpu_ok && mem_ok && gpu_ok))
    can_export=$((cpu_ok && mem_ok))
    can_composite=$((cpu_ok && mem_ok && gpu_ok))

    log_info "  /frame/extract: $([ $can_frame_extract -eq 1 ] && echo 'ENABLED' || echo 'DISABLED')"
    log_info "  /export/start: $([ $can_export -eq 1 ] && echo 'ENABLED' || echo 'DISABLED')"
    log_info "  /frame/composite: $([ $can_composite -eq 1 ] && echo 'ENABLED' || echo 'DISABLED')"

    if [ $can_frame_extract -eq 1 ] && [ $can_export -eq 1 ] && [ $can_composite -eq 1 ]; then
        log_pass "resource guard API (all endpoints enabled)"
    else
        blocked_reasons=""
        [ $cpu_ok -eq 0 ] && blocked_reasons="${blocked_reasons}CPU high, "
        [ $mem_ok -eq 0 ] && blocked_reasons="${blocked_reasons}Memory low, "
        [ $gpu_ok -eq 0 ] && blocked_reasons="${blocked_reasons}GPU unavailable, "
        blocked_reasons=${blocked_reasons%, }
        log_fail "resource guard API (blocked: $blocked_reasons)"
    fi
}

# Comprehensive system resource report
test_system_resource_report() {
    log_info "Testing: Comprehensive system resource report"

    echo ""
    echo "  ╔════════════════════════════════════════════╗"
    echo "  ║       System Resource Report               ║"
    echo "  ╠════════════════════════════════════════════╣"

    # CPU
    cpu_usage=$(get_system_cpu_usage)
    cpu_status="OK"
    [ "$(echo "$cpu_usage > 90" | bc -l 2>/dev/null)" = "1" ] && cpu_status="CRITICAL"
    [ "$(echo "$cpu_usage > 70" | bc -l 2>/dev/null)" = "1" ] && [ "$cpu_status" = "OK" ] && cpu_status="WARNING"
    printf "  ║ CPU Usage:    %6s%% [%-8s]          ║\n" "$cpu_usage" "$cpu_status"

    # Server CPU
    server_cpu=$(get_server_cpu_usage)
    server_status="OK"
    if [ -n "$server_cpu" ]; then
        [ "$(echo "$server_cpu > $CPU_THRESHOLD_PROCESS" | bc -l 2>/dev/null)" = "1" ] && server_status="HIGH"
        printf "  ║ Server CPU:   %6s%% [%-8s]          ║\n" "$server_cpu" "$server_status"
    else
        printf "  ║ Server CPU:   %6s  [%-8s]          ║\n" "N/A" "N/A"
    fi

    # Memory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        total_mem=$(sysctl -n hw.memsize 2>/dev/null)
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
        page_size=$(vm_stat | head -1 | awk '{print $8}')
        free_mem=$((free_pages * page_size))
        mem_usage=$((100 - free_mem * 100 / total_mem))
    else
        mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    fi
    mem_status="OK"
    [ "$mem_usage" -gt 95 ] && mem_status="CRITICAL"
    [ "$mem_usage" -gt 85 ] && [ "$mem_status" = "OK" ] && mem_status="WARNING"
    printf "  ║ Memory Usage: %6s%% [%-8s]          ║\n" "$mem_usage" "$mem_status"

    # GPU
    gpu_status="OK"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        gpu_name=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1 | sed 's/.*Chipset Model: //' | cut -c1-20)
        [ -z "$gpu_name" ] && gpu_status="UNAVAILABLE" && gpu_name="N/A"
    else
        gpu_name="Linux GPU"
    fi
    printf "  ║ GPU:          %-20s [%-8s] ║\n" "$gpu_name" "$gpu_status"

    echo "  ╠════════════════════════════════════════════╣"

    # API endpoints status
    can_preview="ENABLED"
    can_export="ENABLED"
    can_composite="ENABLED"

    [ "$cpu_status" = "CRITICAL" ] || [ "$mem_status" = "CRITICAL" ] && can_preview="DISABLED" && can_export="DISABLED" && can_composite="DISABLED"
    [ "$gpu_status" = "UNAVAILABLE" ] && can_preview="DISABLED" && can_composite="DISABLED"

    printf "  ║ /frame/extract:   %-24s ║\n" "$can_preview"
    printf "  ║ /export/start:    %-24s ║\n" "$can_export"
    printf "  ║ /frame/composite: %-24s ║\n" "$can_composite"

    echo "  ╚════════════════════════════════════════════╝"
    echo ""

    # GPU acceleration check
    if [ -n "$server_cpu" ] && [ "$server_status" = "HIGH" ]; then
        echo -e "${RED}  WARNING: High server CPU detected during operations.${NC}"
        echo "  This may indicate CPU-GPU data transfer issues."
        echo "  Expected: Full GPU acceleration with minimal CPU usage."
        echo ""
    fi

    if [ "$can_preview" = "ENABLED" ] && [ "$can_export" = "ENABLED" ] && [ "$can_composite" = "ENABLED" ]; then
        log_pass "system resource report (all systems operational)"
    else
        log_fail "system resource report (some operations disabled)"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo " media-processor-rs Server API Test Suite"
    echo "=============================================="
    echo " Base URL: $BASE_URL"
    echo "=============================================="
    echo ""

    check_server
    setup_test_env

    # Health check
    log_section "Health Check"
    test_health_check

    # Export API tests
    log_section "Export API Tests"
    test_export_start
    sleep 1  # Wait for job to start
    test_export_status
    test_export_cancel
    test_export_status_nonexistent

    # Keyframe Cache API tests
    log_section "Keyframe Cache API Tests"
    test_keyframes_status
    test_keyframes_warmup
    test_keyframes_seek
    test_keyframes_idr
    test_keyframes_clear

    # Frame Extraction API tests
    log_section "Frame Extraction API Tests"
    test_frame_extract
    test_frame_composite

    # Media Probe API tests
    log_section "Media Probe API Tests"
    test_probe_json
    test_probe_text
    test_probe_video_info
    test_probe_audio_info
    test_probe_nonexistent_file
    test_probe_missing_source

    # Error handling tests
    log_section "Error Handling Tests"
    test_invalid_endpoint
    test_invalid_json

    # Output quality detection tests
    log_section "Output Quality Detection Tests"
    test_frame_black_detection
    test_probe_file_size
    test_probe_audio_volume_info
    test_composite_quality

    # System resource detection tests
    log_section "System Resource Detection Tests"
    test_system_cpu_usage
    test_gpu_availability
    test_memory_usage
    test_vram_detection
    test_resource_guard_api
    test_server_cpu_during_api_call
    test_system_resource_report

    # Summary
    log_section "Test Summary"
    echo -e "${GREEN}Passed:${NC}  $PASSED"
    echo -e "${RED}Failed:${NC}  $FAILED"
    echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
    echo ""

    # Cleanup
    if [ "$FAILED" -eq 0 ]; then
        cleanup
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed. Output preserved in $OUTPUT_DIR${NC}"
        exit 1
    fi
}

# Run main
main "$@"

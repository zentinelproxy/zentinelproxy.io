// Hero terminal animation — lives in static/js/ so Zola's HTML minifier cannot touch it.
(function() {
    var el = document.getElementById('hero-terminal-output');
    if (!el) return;

    var green = '#a6e3a1';
    var muted = '#6c7086';
    var blue = '#89b4fa';
    var mauve = '#cba6f7';
    var text = '#cdd6f4';
    var peach = '#fab387';

    function c(color, s) {
        return '<span style="color:' + color + '">' + s + '</span>';
    }

    var scenes = [
        {
            lines: [
                c(muted, '# Install Zentinel'),
                c(text, '$ ') + 'curl -fsSL https://get.zentinelproxy.io | sh',
                '',
                c(blue, '┌─────────────────────────────────────┐'),
                c(blue, '│') + '     ' + c(green, 'Zentinel') + ' Installer              ' + c(blue, '│'),
                c(blue, '│') + '     Security-first reverse proxy    ' + c(blue, '│'),
                c(blue, '└─────────────────────────────────────┘'),
                '',
                c(blue, 'info') + ': Detected platform: darwin-arm64',
                c(blue, 'info') + ': Fetching latest release...',
                c(blue, 'info') + ': Latest version: 26.03_2',
                c(blue, 'info') + ': Downloading zentinel-26.03_2-darwin-arm64.tar.gz...',
                c(blue, 'info') + ': Verifying checksum...',
                c(blue, 'info') + ': Extracting...',
                c(blue, 'info') + ': Installing to /usr/local/bin/zentinel...',
                '',
                c(green, 'success') + ': Zentinel 26.03_2 installed successfully!',
            ],
            pause: 2500
        },
        {
            lines: [
                c(text, '$ ') + 'zentinel --version',
                'zentinel 0.6.1 (release 26.03_2, commit 5c23fe7)',
            ],
            pause: 1800
        },
        {
            lines: [
                c(muted, '# Write a minimal config'),
                c(text, '$ ') + 'cat zentinel.kdl',
                c(mauve, 'listeners') + ' {',
                '    ' + c(mauve, 'listener') + ' ' + c(green, '"http"') + ' {',
                '        ' + c(blue, 'address') + ' ' + c(green, '"0.0.0.0:8080"'),
                '        ' + c(blue, 'protocol') + ' ' + c(green, '"http"'),
                '    }',
                '}',
                c(mauve, 'routes') + ' {',
                '    ' + c(mauve, 'route') + ' ' + c(green, '"app"') + ' {',
                '        ' + c(mauve, 'matches') + ' { ' + c(blue, 'path-prefix') + ' ' + c(green, '"/"') + ' }',
                '        ' + c(blue, 'upstream') + ' ' + c(green, '"backend"'),
                '    }',
                '}',
            ],
            pause: 3000
        },
        {
            lines: [
                c(muted, '# Validate configuration'),
                c(text, '$ ') + 'zentinel test -c zentinel.kdl',
                ' ' + c(green, 'INFO') + ' Testing configuration file: zentinel.kdl',
                ' ' + c(green, 'INFO') + ' Configuration loaded successfully ' + c(muted, 'path') + '=zentinel.kdl ' + c(muted, 'routes') + '=1 ' + c(muted, 'upstreams') + '=1 ' + c(muted, 'agents') + '=0 ' + c(muted, 'listeners') + '=1',
                ' ' + c(green, 'INFO') + ' Configuration test successful:',
                ' ' + c(green, 'INFO') + '   - 1 listener(s)',
                ' ' + c(green, 'INFO') + '   - 1 route(s)',
                ' ' + c(green, 'INFO') + '   - 1 upstream(s)',
                'zentinel: configuration file zentinel.kdl test is successful',
            ],
            pause: 2500
        },
        {
            lines: [
                c(muted, '# Start the proxy'),
                c(text, '$ ') + 'zentinel run -c zentinel.kdl',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel:') + ' Loading configuration from: zentinel.kdl',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel_proxy::proxy:') + ' Starting Zentinel Proxy',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel_config:') + ' Configuration loaded successfully ' + c(muted, 'path') + '=zentinel.kdl ' + c(muted, 'routes') + '=1 ' + c(muted, 'upstreams') + '=1',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel_proxy::upstream:') + ' Upstream pool created successfully ' + c(muted, 'upstream_id') + '=backend',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel:') + ' HTTP listening on: 0.0.0.0:8080',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel:') + ' Zentinel proxy started successfully',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel:') + ' Configuration hot reload enabled (SIGHUP)',
                ' ' + c(green, 'INFO') + ' ' + c(muted, 'zentinel:') + ' Graceful shutdown enabled (SIGTERM/SIGINT)',
            ],
            pause: 2500
        },
        {
            lines: [
                c(muted, '# Send a request'),
                c(text, '$ ') + 'curl -s localhost:8080/api/health | jq',
                '{',
                '  ' + c(blue, '"status"') + ': ' + c(green, '"ok"') + ',',
                '  ' + c(blue, '"upstream"') + ': ' + c(green, '"127.0.0.1:3000"') + ',',
                '  ' + c(blue, '"latency_ms"') + ': ' + c(peach, '0.42'),
                '}',
            ],
            pause: 3000
        }
    ];

    var sceneIndex = 0;

    function typeScene(scene, onDone) {
        var lineIndex = 0;
        var charIndex = 0;
        var lines = scene.lines;

        function stripTags(html) {
            return html.replace(/<[^>]*>/g, '');
        }

        function getPartialHtml(fullHtml, visibleLen) {
            var result = '';
            var count = 0;
            var i = 0;
            while (i < fullHtml.length && count < visibleLen) {
                if (fullHtml[i] === '<') {
                    var end = fullHtml.indexOf('>', i);
                    result += fullHtml.substring(i, end + 1);
                    i = end + 1;
                } else {
                    result += fullHtml[i];
                    count++;
                    i++;
                }
            }
            var opens = (result.match(/<span[^>]*>/g) || []).length;
            var closes = (result.match(/<\/span>/g) || []).length;
            for (var j = 0; j < opens - closes; j++) result += '</span>';
            return result;
        }

        function isCommand(line) {
            var plain = stripTags(line);
            return plain.startsWith('$ ') || plain.startsWith('# ');
        }

        function tick() {
            if (lineIndex >= lines.length) {
                onDone();
                return;
            }

            var line = lines[lineIndex];
            var plainLen = stripTags(line).length;
            var prev = lines.slice(0, lineIndex).join('\n');

            if (!isCommand(line)) {
                el.innerHTML = (prev ? prev + '\n' : '') + line;
                lineIndex++;
                charIndex = 0;
                setTimeout(tick, 30);
            } else if (charIndex <= plainLen) {
                var partial = getPartialHtml(line, charIndex);
                var cursor = charIndex < plainLen ? '<span class="hero-terminal__cursor">_</span>' : '';
                el.innerHTML = (prev ? prev + '\n' : '') + partial + cursor;
                charIndex++;
                var isComment = stripTags(line).startsWith('#');
                setTimeout(tick, isComment ? 25 : 18);
            } else {
                lineIndex++;
                charIndex = 0;
                setTimeout(tick, 60);
            }
        }

        tick();
    }

    function runScene() {
        var scene = scenes[sceneIndex];
        typeScene(scene, function() {
            setTimeout(function() {
                sceneIndex = (sceneIndex + 1) % scenes.length;
                el.innerHTML = '';
                runScene();
            }, scene.pause);
        });
    }

    var observer = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            runScene();
        }
    });
    observer.observe(el);
})();

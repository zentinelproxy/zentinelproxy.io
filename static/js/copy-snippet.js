// Copy buttons for shell snippets: copies only the command lines ("$ ..."),
// without comments or prompts. Lives in static/js/ so Zola's HTML minifier
// cannot rewrite its string escapes.
(function () {
    document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var pre = document.getElementById(btn.dataset.copyTarget);
            if (!pre) return;
            var cmds = pre.textContent
                .split('\n')
                .filter(function (l) { return l.indexOf('$ ') === 0; })
                .map(function (l) { return l.slice(2); })
                .join('\n');
            var label = btn.querySelector('.code-snippet__copy-label');
            var done = function () {
                if (!label) return;
                label.textContent = 'Copied';
                setTimeout(function () { label.textContent = 'Copy'; }, 2000);
            };
            if (navigator.clipboard) navigator.clipboard.writeText(cmds).then(done, function () {});
        });
    });
})();

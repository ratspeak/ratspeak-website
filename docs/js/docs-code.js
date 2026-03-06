/**
 * docs-code.js — Prism highlighting + copy buttons
 */
(function() {
    'use strict';

    function highlight() {
        var article = document.getElementById('docsArticle');
        if (!article) return;

        var blocks = article.querySelectorAll('pre code');
        for (var i = 0; i < blocks.length; i++) {
            var code = blocks[i];

            // Trigger Prism
            if (window.Prism) {
                Prism.highlightElement(code);
            }

            // Add copy button if not already present
            var pre = code.parentElement;
            if (pre && !pre.querySelector('.code-copy-btn')) {
                var btn = document.createElement('button');
                btn.className = 'code-copy-btn';
                btn.textContent = 'Copy';
                btn.addEventListener('click', createCopyHandler(code, btn));
                pre.style.position = 'relative';
                pre.appendChild(btn);
            }
        }
    }

    function createCopyHandler(codeEl, btnEl) {
        return function() {
            var text = codeEl.textContent;
            navigator.clipboard.writeText(text).then(function() {
                btnEl.textContent = 'Copied!';
                btnEl.classList.add('copied');
                setTimeout(function() {
                    btnEl.textContent = 'Copy';
                    btnEl.classList.remove('copied');
                }, 2000);
            });
        };
    }

    window.DocsCode = {
        highlight: highlight
    };
})();

const dmp = new diff_match_patch();
let diffResults = []; 
let currentDiffIndex = 0;
let versionAContent = '';
let versionBContent = '';

// Store the full diff list for accurate navigation and rendering
let fullDiffsForNavigation = []; 

// --- Debounce Helper Function ---
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- Line Number and Scroll Helpers ---

function calculateLineAndCol(text, index) {
    // Splits the text up to the index to find the line breaks
    const lines = text.substring(0, index).split('\n');
    const line = lines.length; // The line number is the count of lines + 1
    const col = lines[lines.length - 1].length + 1; // Column is characters on the last line segment
    return { line, col };
}

function updateLineNumbers(lineNumbersDivId, content) {
    const lineNumbersDiv = document.getElementById(lineNumbersDivId);
    const lines = content.split('\n');
    let numbers = '';

    const lineCount = (lines.length === 1 && lines[0].length === 0) ? 1 : lines.length;

    for (let i = 1; i <= lineCount; i++) {
        numbers += i + '<br>';
    }
    lineNumbersDiv.innerHTML = numbers;
}

// Line Numbers for Input Textareas
function updateInputLineNumbers() {
    const contentA = document.getElementById('versionAInput').value;
    const contentB = document.getElementById('versionBInput').value;
    
    updateLineNumbers('inputLineNumbersA', contentA);
    updateLineNumbers('inputLineNumbersB', contentB);
}

// Sync scrolling for the display editors (Code Editors)
function syncScrollDisplay(sourceId, targetId) {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    
    target.scrollTop = source.scrollTop;
    
    document.getElementById('lineNumbersA').scrollTop = source.scrollTop;
    document.getElementById('lineNumbersB').scrollTop = source.scrollTop;
}

// Sync scrolling for the input textareas and their line number panels
function syncScrollInput(sourceInputId, targetNumbersId) {
    const source = document.getElementById(sourceInputId);
    const target = document.getElementById(targetNumbersId);
    
    target.scrollTop = source.scrollTop;
}

// --- Rendering and Diff Functions ---

function clearActiveDiffHighlight() {
    document.querySelectorAll('.active-diff').forEach(el => {
        el.classList.remove('active-diff');
    });
}

function renderDiff(editorId, diffs, isVersionA) {
    const editorDiv = document.getElementById(editorId);
    let html = '';
    let contentForLineNumbers = ''; 
    
    for (const diff of diffs) {
        const op = diff[0]; 
        const text = diff[1]; 
        
        let spanClass = '';
        let showText = true;

        if (op === 1) { 
            spanClass = 'added';
            if (isVersionA) showText = false; 
        } else if (op === -1) { 
            spanClass = 'removed';
            if (!isVersionA) showText = false; 
        }
        
        // Replace spaces with non-breaking spaces and escape HTML
        const formattedText = text.replace(/ /g, '\u00a0').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Wrap text in an inline-block span for correct highlight application
        html += `<span class="${spanClass}">${showText ? formattedText : ''}</span>`;
        if (showText) {
            contentForLineNumbers += text;
        }
    }
    
    editorDiv.innerHTML = html;

    return contentForLineNumbers;
}

let lastDiffCount = 0; 

function runDiff(event) {
    versionAContent = document.getElementById('versionAInput').value;
    versionBContent = document.getElementById('versionBInput').value;

    if (!versionAContent && !versionBContent) {
        document.getElementById('percentageDisplay').textContent = `0.00%`;
        document.getElementById('lineDisplay').textContent = '-';
        document.getElementById('colDisplay').textContent = '-';
        document.getElementById('codeEditorA').innerHTML = '';
        document.getElementById('codeEditorB').innerHTML = '';
        updateLineNumbers('lineNumbersA', '');
        updateLineNumbers('lineNumbersB', '');
        lastDiffCount = 0;
        clearActiveDiffHighlight();
        return;
    }

    const diffs = dmp.diff_main(versionAContent, versionBContent);
    dmp.diff_cleanupSemantic(diffs); 
    
    fullDiffsForNavigation = diffs;

    const newDiffResults = diffs.filter(d => d[0] !== 0); 
    
    const diffsChanged = newDiffResults.length !== lastDiffCount;
    lastDiffCount = newDiffResults.length;
    
    diffResults = newDiffResults;
    
    const contentA = renderDiff('codeEditorA', fullDiffsForNavigation, true);
    const contentB = renderDiff('codeEditorB', fullDiffsForNavigation, false);
    
    updateLineNumbers('lineNumbersA', contentA);
    updateLineNumbers('lineNumbersB', contentB);
    
    updateStats(fullDiffsForNavigation, versionAContent.length);
    
    if (diffResults.length > 0) {
        if (diffsChanged) {
             currentDiffIndex = 0;
        }
        // Always call navigateDiff to re-apply the highlight and scroll
        navigateDiff(0, true); 
    } else {
        clearActiveDiffHighlight();
    }
}


function updateStats(diffs, totalLengthA) {
    let equalChars = 0;
    let firstChangeIndexA = -1; // Character index in Version A where the first change occurs
    let currentCharIndexA = 0;

    for (const diff of diffs) {
        const op = diff[0];
        const text = diff[1];
        
        if (op === 0) { 
            equalChars += text.length;
            currentCharIndexA += text.length;
        } else if (op === -1) { 
             if (firstChangeIndexA === -1) { 
                 firstChangeIndexA = currentCharIndexA;
             }
             currentCharIndexA += text.length;
        } else if (op === 1) { 
             if (firstChangeIndexA === -1) { 
                 firstChangeIndexA = currentCharIndexA;
             }
        }
    }

    const totalChars = versionAContent.length + versionBContent.length;
    const totalDiffLength = totalChars - (2 * equalChars); 
    const percentage = totalChars > 0 ? (totalDiffLength / totalChars) * 100 : 0;
    
    document.getElementById('percentageDisplay').textContent = `${percentage.toFixed(2)}%`;

    if (firstChangeIndexA !== -1) {
        // Correctly calculate line and column based on the full content string
        const { line, col } = calculateLineAndCol(versionAContent, firstChangeIndexA);
        document.getElementById('lineDisplay').textContent = line;
        document.getElementById('colDisplay').textContent = col;
    } else {
        document.getElementById('lineDisplay').textContent = '-';
        document.getElementById('colDisplay').textContent = '-';
    }
}


// FUNCTIONAL NAVIGATION: Scrolls the display panels to the change and applies purple highlight.
function navigateDiff(indexOffset) {
    if (diffResults.length === 0) return;

    // Update index based on offset, with loop-around logic
    currentDiffIndex += indexOffset;
    if (currentDiffIndex < 0) {
        currentDiffIndex = diffResults.length - 1; 
    } else if (currentDiffIndex >= diffResults.length) {
        currentDiffIndex = 0; 
    }

    const targetChange = diffResults[currentDiffIndex];
    
    let charIndexA = 0;
    
    // Find the character index corresponding to the start of the current change
    for (const diff of fullDiffsForNavigation) {
        if (diff === targetChange) {
            break; 
        }
        
        if (diff[0] === 0 || diff[0] === -1) {
            charIndexA += diff[1].length;
        }
    }

    // --- Scrolling ---
    const { line } = calculateLineAndCol(versionAContent, charIndexA);
    const editorA = document.getElementById('codeEditorA');
    const editorB = document.getElementById('codeEditorB');
    const lineHeight = 18; 
    const scrollPosition = (line - 1) * lineHeight;

    editorA.scrollTop = scrollPosition;
    editorB.scrollTop = scrollPosition;
    document.getElementById('lineNumbersA').scrollTop = scrollPosition;
    document.getElementById('lineNumbersB').scrollTop = scrollPosition;
    
    // --- Highlighting ---
    clearActiveDiffHighlight();

    const spansA = editorA.querySelectorAll('span');
    const spansB = editorB.querySelectorAll('span');
    
    let currentSpanIndex = 0;

    for (let i = 0; i < fullDiffsForNavigation.length; i++) {
        const diff = fullDiffsForNavigation[i];
        
        if (diff === targetChange) {
            // Apply the active highlight (purple) to the span in the respective editor
            // Check span in version A (removed diffs)
            if (diff[0] === -1 || diff[0] === 0) { 
                if (spansA[currentSpanIndex]) spansA[currentSpanIndex].classList.add('active-diff');
            } 
            // Check span in version B (added diffs)
            if (diff[0] === 1 || diff[0] === 0) {
                if (spansB[currentSpanIndex]) spansB[currentSpanIndex].classList.add('active-diff');
            }
            break; 
        }
        
        // The span index always increments for every diff block
        currentSpanIndex++;
    }

    // Update status bar for navigation
    document.getElementById('lineDisplay').textContent = line;
    document.getElementById('colDisplay').textContent = calculateLineAndCol(versionAContent, charIndexA).col;
}


function clearEditor(version) {
    const inputId = (version === 'A') ? 'versionAInput' : 'versionBInput';
    
    document.getElementById(inputId).value = '';
    
    runDiff(null); 
}

// Apply the debounce wrapper to runDiff
const debouncedRunDiff = debounce(runDiff, 300); 

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    
    document.getElementById('nextBtn').addEventListener('click', () => navigateDiff(1));
    document.getElementById('prevBtn').addEventListener('click', () => navigateDiff(-1));

    // Input listeners: Update line numbers immediately, debounce the heavy diff calculation
    document.getElementById('versionAInput').addEventListener('input', () => {
        updateInputLineNumbers();
        debouncedRunDiff();
    });
    document.getElementById('versionBInput').addEventListener('input', () => {
        updateInputLineNumbers();
        debouncedRunDiff();
    });
    
    // Listen to scroll events on the resizable textareas to sync line numbers
    document.getElementById('versionAInput').addEventListener('scroll', () => syncScrollInput('versionAInput', 'inputLineNumbersA'));
    document.getElementById('versionBInput').addEventListener('scroll', () => syncScrollInput('versionBInput', 'inputLineNumbersB'));
    
    document.getElementById('clearA').addEventListener('click', () => clearEditor('A'));
    document.getElementById('clearB').addEventListener('click', () => clearEditor('B'));

    // Initial run on load
    runDiff(null); 
});
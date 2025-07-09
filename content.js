let extensionEnabled = false;
let schoolId = '';
let schoolName = '';
let professorCache = new Map();
let currentTooltip = null;

//Delay aswell as Hovering
chrome.storage.sync.get(['enabled', 'schoolId', 'schoolName'], (data) => {
    extensionEnabled = data.enabled || false;
    schoolId = data.schoolId || '';
    schoolName = data.schoolName || '';

    if (extensionEnabled && schoolId) {
        startExtension();
    }
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'settingsUpdated') {
        extensionEnabled = request.enabled;
        schoolId = request.schoolId;
        schoolName = request.schoolName;

        if (extensionEnabled && schoolId) {
            startExtension();
        } else {
            stopExtension();
        }
    }
});

function startExtension() {
    createTooltip();
    scanForProfessors();
    watchForChanges();

    // Debug mode - press Alt+D to see what's detected
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'd') {
            console.log('RateMySchedule Debug Info:');
            console.log('Professors found:', document.querySelectorAll('.rmp-professor').length);
            document.querySelectorAll('td').forEach((cell, index) => {
                let text = cell.textContent.trim();
                if (text.length > 5 && text.length < 50) {
                    console.log(`Cell ${index}: "${text}" - Is professor name: ${isProfessorName(text)}`);
                }
            });
        }
    });
}

function stopExtension() {
    removeTooltip();
    removeAllHighlights();
}

function createTooltip() {
    if (!currentTooltip) {
        currentTooltip = document.createElement('div');
        currentTooltip.className = 'rmp-tooltip';
        currentTooltip.style.display = 'none';

        // Keep tooltip visible when hovering over it
        currentTooltip.addEventListener('mouseenter', () => {
            currentTooltip.setAttribute('data-hover', 'true');
        });

        currentTooltip.addEventListener('mouseleave', () => {
            currentTooltip.removeAttribute('data-hover');
            hideTooltip();
        });

        document.body.appendChild(currentTooltip);
    }
}

function isMouseOverTooltip() {
    return currentTooltip && currentTooltip.getAttribute('data-hover') === 'true';
}

function removeTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

function scanForProfessors() {
    // First, try to find instructor column by header
    let headers = document.querySelectorAll('th, td');
    let instructorColumnIndex = -1;

    headers.forEach((header, index) => {
        let text = header.textContent.trim().toLowerCase();
        if (text === 'instructor' || text === 'professor' || text === 'teacher' || text === 'faculty') {
            // Find which column this header is in
            let parentRow = header.parentElement;
            if (parentRow) {
                let cells = Array.from(parentRow.children);
                instructorColumnIndex = cells.indexOf(header) + 1;
            }
        }
    });

    // If we found an instructor column, use it
    if (instructorColumnIndex > 0) {
        let instructorCells = document.querySelectorAll(`td:nth-child(${instructorColumnIndex})`);
        instructorCells.forEach(cell => {
            processCell(cell);
        });
    }

    // Also check common positions (4th and 5th columns)
    let commonColumns = ['td:nth-child(4)', 'td:nth-child(5)', 'td:nth-child(6)'];
    commonColumns.forEach(selector => {
        let cells = document.querySelectorAll(selector);
        cells.forEach(cell => {
            processCell(cell);
        });
    });

    // Check cells with professor-like content
    let allCells = document.querySelectorAll('td');
    allCells.forEach(cell => {
        if (!cell.hasAttribute('data-rmp-processed')) {
            let text = cell.textContent.trim();
            // Check if this cell is likely to contain a professor name
            if (isProfessorName(text)) {
                // Additional check: is this in a data table?
                let table = cell.closest('table');
                if (table && !cell.querySelector('input, button, select')) {
                    processCell(cell);
                }
            }
        }
    });
}

function processCell(cell) {
    if (cell.hasAttribute('data-rmp-processed')) return;

    let text = cell.textContent.trim();

    // Handle cells that might have multiple text nodes or links
    let nameText = '';
    if (cell.querySelector('a')) {
        // If there's a link, use its text
        nameText = cell.querySelector('a').textContent.trim();
    } else {
        // Otherwise use the cell's text
        nameText = text;
    }

    if (isProfessorName(nameText)) {
        makeProfessorClickable(cell, nameText);
    }
}

function isProfessorName(text) {
    if (!text || text.length < 3 || text.length > 50) return false;

    // Clean up the text
    text = text.trim();

    let words = text.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;

    // Must contain only letters, spaces, hyphens, apostrophes, and periods
    let hasValidChars = /^[A-Za-z\s\-'\.]+$/.test(text);
    if (!hasValidChars) return false;

    // Exclude common non-names
    let excludePatterns = [
        'remote', 'online', 'staff', 'tba', 'tbd', 'cancelled', 'closed',
        'campus', 'building', 'room', 'hall', 'center', 'lecture', 'lab',
        'discussion', 'seminar', 'workshop', 'north', 'south', 'east', 'west',
        'main', 'pending', 'arranged', 'location', 'classroom', 'auditorium',
        'section', 'component', 'seats', 'open', 'instructor', 'days'
    ];

    let textLower = text.toLowerCase();
    let isExcluded = excludePatterns.some(pattern => {
        return textLower === pattern || textLower.split(' ').includes(pattern);
    });

    if (isExcluded) return false;

    // Check if it looks like a name (at least one capital letter)
    let hasCapital = /[A-Z]/.test(text);

    // Special case: if all words start with capital (typical for names)
    let looksLikeName = words.every(word =>
        word.length > 0 && /^[A-Z]/.test(word)
    );

    return hasCapital && (looksLikeName || words.length === 2);
}

function makeProfessorClickable(element, professorName) {
    element.setAttribute('data-rmp-processed', 'true');
    element.classList.add('rmp-professor');

    if (!element.style.cursor) {
        element.style.cursor = 'pointer';
    }

    let hideTimeout;

    element.addEventListener('mouseenter', (e) => {
        clearTimeout(hideTimeout);
        e.stopPropagation();
        showProfessorRating(e, professorName);
    });

    element.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
        // Add delay before hiding to allow moving to tooltip
        hideTimeout = setTimeout(() => {
            if (!isMouseOverTooltip()) {
                hideTooltip();
            }
        }, 300);
    });
}

function removeAllHighlights() {
    document.querySelectorAll('.rmp-professor').forEach(element => {
        element.classList.remove('rmp-professor');
        element.removeAttribute('data-rmp-processed');
        element.style.cursor = '';
    });
}

function showProfessorRating(event, professorName) {
    let rect = event.target.getBoundingClientRect();
    currentTooltip.style.left = rect.left + 'px';
    currentTooltip.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    currentTooltip.style.display = 'block';

    if (professorCache.has(professorName)) {
        displayRating(professorCache.get(professorName));
    } else {
        currentTooltip.innerHTML = '<div class="loading">Searching for professor...</div>';
        fetchProfessorRating(professorName);
    }
}

function hideTooltip() {
    if (currentTooltip) {
        currentTooltip.style.display = 'none';
    }
}

function fetchProfessorRating(professorName) {
    chrome.runtime.sendMessage({
        type: 'getProfessorRating',
        professorName: professorName,
        schoolId: schoolId,
        schoolName: schoolName
    }, (response) => {
        if (response && response.success) {
            professorCache.set(professorName, response.data);
            displayRating(response.data);
        } else {
            displayNoRating(professorName);
        }
    });
}

function displayRating(data) {
    let ratingColor = getRatingColor(data.avgRating);
    let difficultyColor = getDifficultyColor(data.avgDifficulty);

    currentTooltip.innerHTML = `
    <div class="rmp-content">
      <div class="professor-header">
        <div class="professor-name">${data.firstName} ${data.lastName}</div>
        <div class="department">${data.department || 'No department listed'}</div>
      </div>
      
      <div class="ratings-row">
        <div class="rating-box" style="background: ${ratingColor}">
          <div class="rating-number">${data.avgRating}</div>
          <div class="rating-label">Quality</div>
        </div>
        
        <div class="rating-box" style="background: ${difficultyColor}">
          <div class="rating-number">${data.avgDifficulty}</div>
          <div class="rating-label">Difficulty</div>
        </div>
        
        <div class="rating-box secondary">
          <div class="rating-number">${data.wouldTakeAgainPercent}%</div>
          <div class="rating-label">Would Take Again</div>
        </div>
      </div>
      
      <div class="total-ratings">${data.numRatings} student ratings</div>
      
      <a href="https://www.ratemyprofessors.com/professor/${data.legacyId}" 
         target="_blank" 
         class="view-profile">
        View Full Profile →
      </a>
    </div>
  `;
}

function displayNoRating(professorName) {
    currentTooltip.innerHTML = `
    <div class="rmp-content">
      <div class="professor-name">${professorName}</div>
      <div class="no-rating">
        <p>No ratings found</p>
        <p class="no-rating-help">This professor may not have ratings yet or may teach at a different school.</p>
      </div>
      <a href="https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(professorName)}" 
         target="_blank" 
         class="view-profile">
        Search on RMP →
      </a>
    </div>
  `;
}

function getRatingColor(rating) {
    if (rating >= 4.0) return '#4CAF50';
    if (rating >= 3.0) return '#FFC107';
    if (rating >= 2.0) return '#FF9800';
    return '#F44336';
}

function getDifficultyColor(difficulty) {
    if (difficulty <= 2.5) return '#4CAF50';
    if (difficulty <= 3.5) return '#FFC107';
    if (difficulty <= 4.0) return '#FF9800';
    return '#F44336';
}

function watchForChanges() {
    let observer = new MutationObserver((mutations) => {
        // Debounce to avoid too many scans
        clearTimeout(window.rmpScanTimeout);
        window.rmpScanTimeout = setTimeout(() => {
            scanForProfessors();
        }, 500);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}
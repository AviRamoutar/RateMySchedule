let extensionEnabled = false;
let schoolId = '';
let schoolName = '';
let professorCache = new Map();
let currentTooltip = null;
let searchSelectors = [
    'td:nth-child(4)',
    'td:nth-child(5)',
    '[class*="instructor"]',
    '[class*="prof"]',
    '[class*="teacher"]',
    'td',
    'div'
];

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
        document.body.appendChild(currentTooltip);
    }
}

function removeTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

function scanForProfessors() {
    searchSelectors.forEach(selector => {
        let elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            let text = element.textContent.trim();
            if (isProfessorName(text) && !element.hasAttribute('data-rmp-processed')) {
                makeProfessorClickable(element, text);
            }
        });
    });
}

function isProfessorName(text) {
    if (!text || text.length < 5 || text.length > 50) return false;

    let words = text.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;

    let hasLettersOnly = /^[A-Za-z\s\-'\.]+$/.test(text);
    let hasNumbers = /\d/.test(text);
    let commonNonNames = ['remote', 'online', 'staff', 'tba', 'tbd', 'cancelled', 'closed'];
    let isCommonNonName = commonNonNames.some(word => text.toLowerCase().includes(word));

    return hasLettersOnly && !hasNumbers && !isCommonNonName;
}

function makeProfessorClickable(element, professorName) {
    element.setAttribute('data-rmp-processed', 'true');
    element.classList.add('rmp-professor');
    element.style.cursor = 'pointer';

    element.addEventListener('mouseenter', (e) => {
        showProfessorRating(e, professorName);
    });

    element.addEventListener('mouseleave', () => {
        hideTooltip();
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
    let observer = new MutationObserver(() => {
        scanForProfessors();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
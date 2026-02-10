const STAT_TIERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SR', 'SSR', 'UR', 'LR', 'MR', 'X', 'XX', 'XXX', 'EX', 'DX'];
const BREAKTHROUGH_NAMES = ['None', 'Awakened', 'Ascendant', 'Transcendent'];
const CARD_RARITIES = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'challenger'];

// ========== QUEST CHALLENGES SYSTEM ==========
const CHALLENGE_TYPES = {
    QTE: 'qte',           // Quick Time Event - timing based
    QUIZ: 'quiz',         // Multiple choice questions
    TIMING: 'timing',     // Click spam in time limit
    PATTERN: 'pattern',   // Remember and repeat pattern
    INVESTIGATION: 'investigation' // Find clues/items
};

let challengeState = {
    active: false,
    type: null,
    questId: null,
    data: null,
    score: 0,
    attempts: 0,
    maxAttempts: 3
};
// ========== END QUEST CHALLENGES SYSTEM ==========

// Store pending stat gains from rewards - applied AFTER breakthrough overlay
let pendingStatGains = [];

// Stat Growth Configuration
const STAT_CONFIG = {
    INTELLIGENCE_MAX: 6,    // S (index 6) - Giới hạn tối đa Trí tuệ
    POTENTIAL_MAX: 6,       // S (index 6) - Giới hạn tối đa Tiềm năng
    INTELLIGENCE_QUEST_THRESHOLD: 25,  // Tăng Intelligence mỗi 25 quests
    // Combat stat caps by quest progression
    COMBAT_STAT_CAP_QUEST_299: 8,   // SSS (index 8) từ quest 299 trở lại
    // Function to get current stat cap based on context (quest/progression)
    // context: { questId, target: 'player'|'crew'|'enemy'|'boss'|'minion' }
            getStatCap: function(context = {}) {
        const target = context.target || 'player';

        // Resolve questId: explicit > current battle > highest completed quest
        const questId = context.questId || (typeof battleState !== 'undefined' && battleState.currentQuestId) || (gameState.quests && gameState.quests.filter(q => q.completed).length ? Math.max(...gameState.quests.filter(q => q.completed).map(q => q.id)) : 0);
        const hasGukja = gameState.crew && gameState.crew.some(c => c.name === 'Yang Gukja');
        const breakthroughLevel = gameState.character ? gameState.character.breakthrough : 0;
        const jeahaDefeated = (gameState.quests && (gameState.quests.find(q => q.id === 198) || {}).completed);
        const quest498Completed = (gameState.quests && (gameState.quests.find(q => q.id === 498) || {}).completed);
        const quest499Completed = (gameState.quests && (gameState.quests.find(q => q.id === 499) || {}).completed);
        const hasEnlightenmentPath = quest498Completed; // Quest 498 opens Enlightenment Path

        // If target is not player or crew, stat cap does not apply (no cap)
        if (target !== 'player' && target !== 'crew') {
            return STAT_TIERS.length - 1;
        }

        // TRANSCENDANT: After quest 499 completion, remove all stat caps
        if (quest499Completed) {
            return STAT_TIERS.length - 1;
        }

        // Default cap is SSS (index 8)
        let cap = 8;

        // Determine cap based on quest progression ranges (use else-if to avoid overlap)
        if (questId >= 1 && questId < 100) {
            // 1) Quest 1 -> 99: cap C (index 3) for MC and crew
            cap = 3;
        } 
        else if (questId >= 100 && questId < 150) {
            // 2) Quest 100 -> 149: if Yang Gukja present AND no Awakened, cap A (5)
            if (hasGukja && breakthroughLevel < 1) {
                cap = 5;
            } else {
                cap = 8; // Otherwise SSS (8)
            }
        } 
        else if (questId >= 150 && questId < 301) {
            // 3) Quest 150 -> 300: Awakened (breakthrough >= 1) required
            if (breakthroughLevel >= 1) {
                // If Awakened, cap depends on Han Jaeha (Quest 198) status
                if (jeahaDefeated) {
                    cap = 8; // Han Jaeha defeated => SSS (8)
                } else {
                    cap = 7; // Han Jaeha not defeated => SS (7)
                }
            } else {
                // No Awakened yet => stay at default SSS (8)
                cap = 8;
            }
        } 
        else if (questId >= 301 && questId <= 350) {
            // 4) Quest 301 -> 350: cap UR (index 11)
            cap = 11;
        } 
        else if (questId >= 351 && questId <= 489) {
            // 5) Quest 351 -> 489: cap X (index 14)
            cap = 14;
        } 
        else if (questId >= 490 && questId < 498) {
            // 6) Quest 490 -> 497: cap XXX (index 16)
            cap = 16;
        }
        else if (questId >= 498 && questId < 499) {
            // 7) Quest 498: ENLIGHTENMENT PATH UNLOCKED - cap DX (index 18)
            // After defeating Choyun and achieving Transcendent breakthrough,
            // MC opens the Enlightenment Path and can reach DX tier
            cap = 18; // DX tier
        }

        // Debug: log resolved cap decisions to help trace unexpected unlocks
        try {
            console.log('[STAT_CAP] context=' + JSON.stringify(context) + ' resolvedQuest=' + questId + ' target=' + target + ' breakthrough=' + breakthroughLevel + ' hasEnlightenment=' + hasEnlightenmentPath + ' capIndex=' + cap + ' capTier=' + STAT_TIERS[cap]);
        } catch (e) {
            // ignore logging errors
        }

        return cap;
    }
};

// Card requirements for tiers above or equal to SSS (index 8)
const CARD_REQUIREMENTS = {
    8: 2,   // SSS -> SR
    9: 3,   // SR -> SSR
    10: 4,  // SSR -> UR
    11: 5,  // UR -> LR
    12: 6,  // LR -> MR
    13: 10, // MR -> X
    14: 15, // X -> XX
    15: 20, // XX -> XXX
    16: 30, // XXX -> EX
    17: 50  // EX -> DX
};

function cardsRequiredForFromIndex(idx) {
    return CARD_REQUIREMENTS[idx] || 1;
}

// Format stat tier: convert index to tier name, return 'UNMEASURABLE' if > 18
function getFormattedStatTier(statIndex) {
    if (typeof statIndex !== 'number') return 'F';
    // Clamp to valid range, but allow visualization of UNMEASURABLE
    if (statIndex > 18) return 'UNMEASURABLE';
    const clamped = Math.min(Math.max(0, statIndex), STAT_TIERS.length - 1);
    return STAT_TIERS[clamped];
}

// Compute units provided by a reward for a specific stat (for MC)
function unitsFromRewardForStat(reward, statName) {
    if (!reward) return 0;
    if (reward.type === 'stat') {
        if (reward.effect === `all_stats+1`) return 1;
        if (reward.effect && reward.effect.startsWith('all_stats+')) {
            const n = parseInt(reward.effect.split('+')[1]) || 1;
            return n;
        }
        const m = reward.effect ? reward.effect.match(new RegExp(statName + "\\+(\\d+)", 'i')) : null;
        if (m) return parseInt(m[1]);
        // fallback: some stat cards are named differently
        if (reward.effect && reward.effect.includes(statName)) return 1;
    }
    return 0;
}

// Units provided by a cultivation reward (treat reward.level as units)
function unitsFromCultivation(reward) {
    if (!reward) return 0;
    if (reward.type === 'cultivation') {
        return reward.level || 1;
    }
    return 0;
}

// Calculate card-units needed to raise from currentIndex to targetIndex
function unitsNeededToReach(currentIndex, targetIndex) {
    if (targetIndex <= currentIndex) return 0;
    let units = 0;
    let cur = currentIndex;
    while (cur < targetIndex) {
        if (cur < 8) {
            // each unit directly increases one tier below SSS
            units += 1;
            cur += 1;
        } else {
            const req = cardsRequiredForFromIndex(cur);
            units += req;
            cur += 1;
        }
    }
    return units;
}

// Adjust quest rewards to ensure sufficient stat/cultivation cards before boss fights
function adjustQuestRewardsForProgression() {
    // Build quest lookup by id
    const questById = {};
    gameState.quests.forEach(q => questById[q.id] = q);

    // Track cumulative units available before current quest for MC stats
    const cumulativeUnits = { strength: 0, speed: 0, durability: 0 };

    // Helper to add stat reward to a quest id
    function addStatRewardToQuest(qId, statName, units) {
        const q = questById[qId];
        if (!q) return;
        for (let i = 0; i < units; i++) {
            q.rewards.push({ type: 'stat', name: `Thẻ Stat Bổ sung ${statName}`, rarity: 'bronze', effect: `${statName}+1` });
        }
    }

    // Helper to add cultivation reward to a quest id
    function addCultivationToQuest(qId, statType, count) {
        const q = questById[qId];
        if (!q) return;
        for (let i = 0; i < count; i++) {
            q.rewards.push({ type: 'cultivation', name: `Thẻ Bồi dưỡng ${statType}`, rarity: 'bronze', effect: 'crew_boost', statType: statType, level: 1 });
        }
    }

    // Iterate quests in ascending order
    const sorted = gameState.quests.slice().sort((a,b) => a.id - b.id);
    // Pre-scan: count units from quest 1..n-1 as we go
    for (let i = 0; i < sorted.length; i++) {
        const q = sorted[i];
        
        // Get boss stats - handle both single boss and double boss (bosses array)
        let bossStats = null;
        if (q.boss && Array.isArray(q.boss.stats)) {
            bossStats = q.boss.stats;
        } else if (q.bosses && Array.isArray(q.bosses) && q.bosses.length > 0) {
            // For double boss, take the max stat from each dimension
            bossStats = [
                Math.max(...q.bosses.map(b => b.stats[0])),
                Math.max(...q.bosses.map(b => b.stats[1])),
                Math.max(...q.bosses.map(b => b.stats[2]))
            ];
        }
        
        // If this quest has a boss, ensure cumulative units before this quest meet boss stats
        if (bossStats) {
            const statNames = ['strength','speed','durability'];
            for (let si = 0; si < 3; si++) {
                const target = bossStats[si];
                // current MC stat assumed starting from initial character state
                const current = gameState.character[statNames[si]] || 0;
                // But player may have gained units from earlier quests; assume full conversion of cumulativeUnits to stat increases
                // Compute units already available before this quest
                const available = cumulativeUnits[statNames[si]];
                const neededUnits = unitsNeededToReach(current, target);
                if (available < neededUnits) {
                    const deficit = neededUnits - available;
                    // Add these units to previous quest (preferably q.id -1)
                    const targetQuestId = (i > 0) ? sorted[i-1].id : q.id;
                    // Distribute between stat cards (for MC) and cultivation cards (for crew)
                    // We'll add full deficit as stat cards and also add same number of cultivation cards so crew can use them
                    addStatRewardToQuest(targetQuestId, statNames[si], deficit);
                    addCultivationToQuest(targetQuestId, statNames[si], deficit);
                    cumulativeUnits[statNames[si]] += deficit;
                }
            }
        }

        // After ensuring, include this quest's own rewards into cumulativeUnits for future bosses
        if (q.rewards && Array.isArray(q.rewards)) {
            q.rewards.forEach(r => {
                // stat rewards
                cumulativeUnits.strength += unitsFromRewardForStat(r, 'strength');
                cumulativeUnits.speed += unitsFromRewardForStat(r, 'speed');
                cumulativeUnits.durability += unitsFromRewardForStat(r, 'durability');
                // cultivation
                if (r.type === 'cultivation') {
                    // assign to random or specified statType
                    const st = r.statType || (r.name && r.name.includes('Sức') ? 'strength' : r.statType || 'strength');
                    if (st === 'strength') cumulativeUnits.strength += unitsFromCultivation(r);
                    if (st === 'speed') cumulativeUnits.speed += unitsFromCultivation(r);
                    if (st === 'durability') cumulativeUnits.durability += unitsFromCultivation(r);
                }
            });
        }
    }
}

// Battle Timing Configuration (in milliseconds)
const BATTLE_TIMING = {
    ENEMY_RESPONSE_TIME: 800,      // Thời gian đối thủ suy nghĩ (800ms = 0.8 giây)
    BREAKTHROUGH_DISPLAY_TIME: 3000 // Thời gian hiển thị breakthrough (3 giây)
};

// Game State
const gameState = {
    character: {
        name: "MC (Bạn)",
        hp: 100,
        maxHp: 100,
        strength: 1, // Index trong STAT_TIERS (1 = E)
        speed: 1,    // Index trong STAT_TIERS (1 = E)
        durability: 1, // Index trong STAT_TIERS (1 = E)
        statProgress: [0,0,0],
        potential: 0,
        intelligence: 0,
        breakthrough: 0, // 0: None, 1: Awakened, 2: Ascendant, 3: Transcendent
        usedForcedBreak: false,
        hasExclusiveSkill: false
    },
    currentArc: 1,
    completedQuests: 0,
    totalPoints: 0,
    totalBossQuests: 0,  // Set during filterBossOnlyQuests()
    inventory: [],
    crew: [],
    quests: [],
    currentFilter: 'all',
    currentCardFilter: 'all',
    questChoices: {},  // Track story choices: { questId: choice }
    rewardsBeforeFilter: {},  // Store rewards from all quests before filtering
    bossQuestIds: []  // Store boss quest IDs for reward assignment
};

// Track used question IDs so quizzes don't repeat questions across quests
gameState.usedQuestionIds = [];

// Question bank (id, category, question, options)
const QUESTION_BANK = [
    { id: 'q01', cat: 'general', question: 'Trong chiến đấu, yếu tố nào giúp tăng cơ hội sống sót nhất?', options: [{text:'Sức mạnh đơn thuần', points:10},{text:'Chiến thuật và teamwork', points:40},{text:'May mắn', points:5},{text:'Trang bị tốt', points:20}] },
    { id: 'q02', cat: 'strategy', question: 'Khi bị áp đảo, chiến lược an toàn nhất là?', options: [{text:'Tấn công liều lĩnh', points:5},{text:'Rút lui và tái tổ chức', points:40},{text:'Cố gắng 1 vs 1', points:10},{text:'Cầu cứu người lạ', points:20}] },
    { id: 'q03', cat: 'bully', question: 'Khi gặp kẻ bắt nạt, hành động phù hợp nhất là gì?', options: [{text:'Đáp trả bạo lực', points:5},{text:'Ghi nhận, tìm bằng chứng và báo lại', points:40},{text:'Im lặng chịu đựng', points:5},{text:'Độc lập đơn thương', points:20}] },
    { id: 'q04', cat: 'training', question: 'Bài tập nào giúp tăng sức bền cơ bản?', options: [{text:'Chạy lâu', points:40},{text:'Nâng tạ nặng 1 lần', points:10},{text:'Chơi game', points:0},{text:'Ngủ nhiều', points:5}] },
    { id: 'q05', cat: 'tactics', question: 'Khi nhìn thấy điểm yếu đối thủ, bạn nên?', options: [{text:'Báo cho team', points:30},{text:'Lợi dụng ngay lập tức', points:40},{text:'Phớt lờ', points:5},{text:'Khoe cho kẻ khác', points:10}] },
    { id: 'q06', cat: 'stealth', question: 'Thao tác tốt nhất để tiếp cận mục tiêu mà không bị phát hiện?', options: [{text:'Chạy ầm ầm', points:0},{text:'Di chuyển im lặng, tận dụng bóng tối', points:40},{text:'Gọi to', points:0},{text:'Đứng yên', points:5}] },
    { id: 'q07', cat: 'negotiation', question: 'Khi hoà giải với kẻ bắt nạt, yếu tố quan trọng là?', options: [{text:'Giọng điệu và bằng chứng', points:40},{text:'Đe doạ thêm', points:5},{text:'Cúi đầu hoàn toàn', points:0},{text:'Lôi kéo bạn bè', points:20}] },
    { id: 'q08', cat: 'speed', question: 'Luyện tập nào cải thiện tốc độ phản ứng?', options: [{text:'QTE / phản xạ ngắn', points:40},{text:'Chạy đường dài', points:10},{text:'Tập trí não', points:20},{text:'Không luyện', points:0}] },
    { id: 'q09', cat: 'general', question: 'Yếu tố nào góp phần vào sức mạnh đội?', options: [{text:'Lãnh đạo tốt', points:40},{text:'Lúc nào cũng cãi nhau', points:0},{text:'Mỗi người làm lẻ tẻ', points:5},{text:'Không có mục tiêu', points:0}] },
    { id: 'q10', cat: 'strategy', question: 'Làm thế nào để chuẩn bị cho một trận chiến không chắc thắng?', options: [{text:'Chuẩn bị lui quân và bẫy', points:40},{text:'Chờ đối thủ yếu đi', points:10},{text:'Không làm gì', points:0},{text:'Cố chấp tấn công', points:5}] },
    { id: 'q11', cat: 'bully', question: 'Khi bắt nạt diễn ra ở trường, phản ứng tốt nhất là?', options: [{text:'Tìm người lớn và bằng chứng', points:40},{text:'Lặn lút mọi lúc', points:0},{text:'Nhờ báo mạng', points:10},{text:'Tránh toàn bộ nơi đó', points:5}] },
    { id: 'q12', cat: 'training', question: 'Bài tập tăng tốc lực tay tốt nhất?', options: [{text:'Push-up và clap', points:40},{text:'Chạy bộ', points:10},{text:'Ngồi thiền', points:5},{text:'Ăn đồ ăn nhanh', points:0}] },
    { id: 'q13', cat: 'tactics', question: 'Khi phải chiến đấu nhóm, điều quan trọng nhất là?', options: [{text:'Phân công vai trò rõ ràng', points:40},{text:'Ai cũng làm mọi thứ', points:5},{text:'Tự ý quyết định', points:0},{text:'Thiếu liên lạc', points:0}] },
    { id: 'q14', cat: 'general', question: 'Yếu tố nào ít quan trọng khi chiến đấu?', options: [{text:'May mắn', points:5},{text:'Kỹ năng', points:40},{text:'Hiểu biết đối thủ', points:30},{text:'Trang phục', points:0}] },
    { id: 'q15', cat: 'bully', question: 'Động lực tốt nhất để chống lại bắt nạt là?', options: [{text:'Báo thù', points:5},{text:'Bảo vệ người khác và chính mình', points:40},{text:'Nổi tiếng', points:0},{text:'Trốn tránh', points:0}] },
    { id: 'q16', cat: 'strategy', question: 'Khi lên kế hoạch, điều cần làm đầu tiên là?', options: [{text:'Xác định mục tiêu', points:40},{text:'Chạy thử', points:5},{text:'Tìm lỗi đối thủ ngay', points:10},{text:'Bỏ qua', points:0}] },
    { id: 'q17', cat: 'speed', question: 'Làm sao để cải thiện phản xạ tay mắt?', options: [{text:'Tập QTE và bài tập phản xạ', points:40},{text:'Ăn nhiều', points:0},{text:'Ngồi im', points:0},{text:'Chơi cờ', points:10}] },
    { id: 'q18', cat: 'negotiation', question: 'Yếu tố cần khi thuyết phục đám đông?', options: [{text:'Hành động có bằng chứng', points:40},{text:'Ngôn từ xúc phạm', points:0},{text:'Giấu thông tin', points:5},{text:'Trì hoãn', points:0}] },
    { id: 'q19', cat: 'stealth', question: 'Khi muốn tránh sự chú ý, điều quan trọng là?', options: [{text:'Giữ khoảng cách và di chuyển lặng', points:40},{text:'Mặc đồ nổi bật', points:0},{text:'Kêu to', points:0},{text:'Tự tin khoe', points:5}] },
    { id: 'q20', cat: 'training', question: 'Tập luyện nào hữu ích cho cơ bụng?', options: [{text:'Gập bụng', points:40},{text:'Chạy bền', points:10},{text:'Nâng tạ', points:20},{text:'Ngủ nhiều', points:0}] },
    { id: 'q21', cat: 'strategy', question: 'Một điểm mạnh chiến lược là gì?', options: [{text:'Tận dụng thông tin', points:40},{text:'Hành động vội vàng', points:0},{text:'Tự mãn', points:0},{text:'Không đổi mới', points:5}] },
    { id: 'q22', cat: 'general', question: 'Điểm mạnh nào có giá trị lâu dài?', options: [{text:'Kỹ năng học hỏi', points:40},{text:'May mắn', points:0},{text:'Tài sản tạm thời', points:5},{text:'Cường điệu', points:0}] },
    { id: 'q23', cat: 'bully', question: 'Cách khéo léo để giảm căng thẳng sau khi bị bắt nạt?', options: [{text:'Tâm sự với người tin tưởng', points:40},{text:'Hành động bạo lực', points:0},{text:'Giấu cảm xúc', points:5},{text:'Vườn ươm', points:0}] },
    { id: 'q24', cat: 'speed', question: 'Tốc độ tốt giúp gì trong giao tranh?', options: [{text:'Di chuyển tránh đòn', points:40},{text:'Tăng HP', points:0},{text:'Tăng tiền thưởng', points:0},{text:'Không tác dụng', points:5}] },
    { id: 'q25', cat: 'tactics', question: 'Khi đối phương đông hơn, ưu tiên của bạn?', options: [{text:'Phân tán kẻ mạnh', points:40},{text:'Đâm đầu vào giữa', points:0},{text:'Chuyển sang phòng thủ', points:20},{text:'Bỏ chạy', points:5}] },
    { id: 'q26', cat: 'negotiation', question: 'Cách tốt nhất để thương lượng một lệnh ràng buộc?', options: [{text:'Chuẩn bị phương án dự phòng', points:40},{text:'Nói thẳng mọi thứ', points:20},{text:'Đe dọa', points:0},{text:'Im lặng', points:5}] },
    { id: 'q27', cat: 'training', question: 'Bài tập tăng sức bền tim mạch?', options: [{text:'Chạy interval', points:40},{text:'Ngồi nhiều', points:0},{text:'Tập 1 lần', points:5},{text:'Ăn nhiều đồ ngọt', points:0}] },
    { id: 'q28', cat: 'general', question: 'Trong team, điều quan trọng nhất?', options: [{text:'Tin tưởng lẫn nhau', points:40},{text:'Thiếu liên lạc', points:0},{text:'Ai mạnh hơn quyết định', points:5},{text:'Không có kế hoạch', points:0}] },
    { id: 'q29', cat: 'tactics', question: 'Điều nên làm trước khi tấn công?', options: [{text:'Mô tả điểm yếu đối thủ', points:40},{text:'Chạy thử', points:5},{text:'Không chuẩn bị', points:0},{text:'Chờ họ yếu đi', points:10}] },
    { id: 'q30', cat: 'bully', question: 'Làm thế nào để ngăn chặn bắt nạt lan rộng?', options: [{text:'Ghi chép và thông báo', points:40},{text:'Tung tin xấu', points:0},{text:'Làm ngơ', points:5},{text:'Kích động', points:0}] }
];

// Initialize Game
function initGame() {
    console.log('🎮 Initializing Questism Game...');
    initializeQuests();
    // Remove any duplicate quests (same id) that may have been added accidentally
    removeDuplicateQuests();
    // Filter to keep only boss quests
    filterBossOnlyQuests();
    // Setup reward ranges for boss progression
    assignRewardsForBossProgression();
    // Give initial rewards to player at start
    giveInitialRewards();
    // Ensure boss quests have enough stat/cultivation card rewards
    ensureBossQuestRewards();
    // Adjust quest rewards so players receive enough stat/cultivation cards before tough bosses
    adjustQuestRewardsForProgression();
    try {
        updateUI();
    } catch (e) {
        console.error('Error updating UI:', e);
    }
    showIntro();
    console.log('✅ Game initialized successfully!');
}

// Remove duplicate quests by id, keeping first occurrence
function removeDuplicateQuests() {
    const seen = new Set();
    const deduped = [];
    for (const q of gameState.quests) {
        if (!seen.has(q.id)) {
            seen.add(q.id);
            deduped.push(q);
        } else {
            console.warn('Removed duplicate quest id:', q.id);
        }
    }
    gameState.quests = deduped;
}

// Filter to keep only Boss quests and update prerequisites
function filterBossOnlyQuests() {
    // Store rewards from all quests (boss and non-boss) BEFORE filtering
    const rewardsBeforeFilter = {};
    gameState.quests.forEach(q => {
        rewardsBeforeFilter[q.id] = (q.rewards && q.rewards.length > 0) ? [...q.rewards] : [];
    });
    
    // Identify boss quests (quests with boss or bosses property)
    const bossQuestIds = gameState.quests
        .filter(q => q.boss || q.bosses)
        .map(q => q.id)
        .sort((a, b) => a - b);
    
    console.log(`🎯 Boss quests found: ${bossQuestIds.length} quests`);
    console.log('Boss quest IDs:', bossQuestIds.join(', '));
    
    // Keep boss quests and preserve key choice quests (e.g., Quest 199)
    gameState.quests = gameState.quests.filter(q => q.boss || q.bosses || q.hasChoice || q.id === 199);
    
    // Store the pre-filter rewards and boss quest IDs for reward distribution
    gameState.rewardsBeforeFilter = rewardsBeforeFilter;
    gameState.bossQuestIds = bossQuestIds;
    
    // Store total quest count for progress tracking
    gameState.totalBossQuests = gameState.quests.length;
    
    // Update prerequisites to reference valid boss quest chain
    for (let i = 0; i < gameState.quests.length; i++) {
        const quest = gameState.quests[i];
        
        if (i === 0) {
            // First quest has no prerequisites
            quest.prerequisites = [];
        } else {
            // Link to previous boss quest
            quest.prerequisites = [gameState.quests[i - 1].id];
        }
    }
    
    console.log(`✅ Filtered to ${gameState.quests.length} boss quests`);
    console.log(`✅ Updated prerequisites for boss-only chain`);
}

// Ensure boss quests have enough stat/cultivation card rewards
function ensureBossQuestRewards() {
    const statNames = ['strength', 'speed', 'durability'];
    const rarities = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'];
    
    // Track cumulative cards available for each stat
    const cumulativeCards = { strength: 0, speed: 0, durability: 0 };
    
    gameState.quests.forEach((quest, index) => {
        if (!quest.boss && !quest.bosses) return; // Skip non-boss quests
        
        // Initialize rewards if needed
        if (!quest.rewards) {
            quest.rewards = [];
        }
        
        // Count existing stat/cultivation cards
        let hasStatCards = false;
        quest.rewards.forEach(r => {
            if (r.type === 'stat' && r.effect) {
                const match = r.effect.match(/(\w+)\+(\d+)/);
                if (match && statNames.includes(match[1])) {
                    cumulativeCards[match[1]] += parseInt(match[2]);
                    hasStatCards = true;
                }
            }
            if (r.type === 'cultivation') {
                // Assume cultivation card provides 1 unit per level
                const st = r.statType || 'strength';
                if (statNames.includes(st)) {
                    cumulativeCards[st] += (r.level || 1);
                }
            }
        });
        
        // Determine boss difficulty and required cards
        let bossStats = null;
        if (quest.boss) {
            bossStats = quest.boss.stats;
        } else if (quest.bosses && quest.bosses.length > 0) {
            // For double boss, take the highest stat as reference
            bossStats = [
                Math.max(...quest.bosses.map(b => b.stats[0])),
                Math.max(...quest.bosses.map(b => b.stats[1])),
                Math.max(...quest.bosses.map(b => b.stats[2]))
            ];
        }
        
        if (!bossStats) return;
        
        // Add stat cards if missing and boss requires them
        for (let i = 0; i < 3; i++) {
            const stat = statNames[i];
            const bossLevel = bossStats[i];
            
            // If boss requires this stat but we don't have cards for it, add some
            if (bossLevel > 0 && !quest.rewards.some(r => 
                r.type === 'stat' && r.effect && r.effect.includes(stat))) {
                
                const rarity = bossLevel <= 2 ? 'bronze' : bossLevel <= 5 ? 'silver' : 'gold';
                const quantity = Math.max(1, Math.floor(bossLevel / 3));
                
                for (let j = 0; j < quantity; j++) {
                    quest.rewards.push({
                        type: 'stat',
                        name: `Thẻ ${stat === 'strength' ? 'Sức mạnh' : stat === 'speed' ? 'Tốc độ' : 'Chịu đòn'} ${rarity}`,
                        rarity: rarity,
                        effect: `${stat}+1`
                    });
                }
                cumulativeCards[stat] += quantity;
            }
        }
        
        // Always add at least one cultivation card for crew bonus
        if (!quest.rewards.some(r => r.type === 'cultivation')) {
            const rarity = index < 5 ? 'silver' : index < 15 ? 'gold' : 'platinum';
            quest.rewards.push({
                type: 'cultivation',
                name: `Thẻ Bồi dưỡng ${rarity}`,
                rarity: rarity,
                effect: 'crew_boost',
                statType: statNames[index % 3],
                level: 1
            });
        }
    });
    
    console.log(`✅ Ensured boss quest rewards`);
}

// Assign rewards based on boss progression - rewards of quests before boss go to that boss
function assignRewardsForBossProgression() {
    const bossQuestIds = gameState.bossQuestIds || gameState.quests.map(q => q.id).sort((a, b) => a - b);
    const rewardsBeforeFilter = gameState.rewardsBeforeFilter || {};
    
    if (bossQuestIds.length === 0) return;
    
    console.log(`📊 Setting up reward ranges for ${bossQuestIds.length} boss quests`);
    
    // For each boss quest, calculate which quests' rewards belong to it
    const rewardRanges = {};
    
    for (let i = 0; i < bossQuestIds.length; i++) {
        const currentBossId = bossQuestIds[i];
        let rangeStart, rangeEnd;
        
        // Rewards from this boss to next boss (exclusive)
        rangeStart = currentBossId;
        if (i + 1 < bossQuestIds.length) {
            rangeEnd = bossQuestIds[i + 1] - 1;
        } else {
            // Last boss: from this boss to quest 500
            rangeEnd = 500;
        }
        
        rewardRanges[currentBossId] = { rangeStart, rangeEnd };
        
        console.log(`  Boss Quest ${currentBossId}: Will grant rewards from Quest ${rangeStart}-${rangeEnd}`);
    }
    
    // Store reward ranges in gameState for later use when completing quests
    gameState.rewardRanges = rewardRanges;
    console.log(`✅ Reward ranges configured`);
}

// Give initial rewards to player at game start (rewards from 1 to first boss - 1)
function giveInitialRewards() {
    const bossQuestIds = gameState.bossQuestIds || [];
    if (bossQuestIds.length === 0) return;
    
    const rewardsBeforeFilter = gameState.rewardsBeforeFilter || {};
    const firstBossId = bossQuestIds[0];
    const rangeEnd = firstBossId - 1;
    
    console.log(`🎁 Giving initial rewards from Quest 1-${rangeEnd}`);
    
    let addedCount = 0;
    for (let qId = 1; qId <= rangeEnd; qId++) {
        if (rewardsBeforeFilter[qId] && rewardsBeforeFilter[qId].length > 0) {
            rewardsBeforeFilter[qId].forEach(reward => {
                processReward({...reward}, qId);
                addedCount++;
            });
        }
    }
    
    console.log(`✅ Added ${addedCount} reward items to starting inventory`);
}

// Function to grant rewards when a boss quest is completed
function grantBossQuestRewards(questId) {
    const rewardRanges = gameState.rewardRanges || {};
    const rewardsBeforeFilter = gameState.rewardsBeforeFilter || {};
    
    if (!rewardRanges[questId]) return;
    
    const { rangeStart, rangeEnd } = rewardRanges[questId];
    
    console.log(`🎁 Granting rewards from Quest ${rangeStart}-${rangeEnd} for completing Boss Quest ${questId}`);
    
    let addedCount = 0;
    for (let qId = rangeStart; qId <= rangeEnd; qId++) {
        // Avoid re-processing the boss quest's own rewards (they are processed at completion)
        if (qId === questId) continue;
        if (rewardsBeforeFilter[qId] && rewardsBeforeFilter[qId].length > 0) {
            rewardsBeforeFilter[qId].forEach(reward => {
                processReward({...reward}, qId);
                addedCount++;
            });
        }
    }
    
    console.log(`✅ Added ${addedCount} reward items from quest range`);
    
    // Show notification to player
    if (addedCount > 0) {
        showRewardNotification([{
            type: 'special',
            name: `Quest Range ${rangeStart}-${rangeEnd} Rewards`,
            rarity: 'master',
            effect: 'quest_range_rewards'
        }]);
    }
}

// Show Intro Modal
function showIntro() {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = '📖 Câu chuyện bắt đầu...';
    modalBody.innerHTML = `
        <p style="line-height: 1.8; margin: 15px 0;">
            Bạn là một học sinh cấp 3 thường xuyên bị bắt nạt tại Gangbuk Phía Tây.
        </p>
        <p style="line-height: 1.8; margin: 15px 0;">
            Một ngày nọ, một thông báo hệ thống kỳ lạ xuất hiện trước mắt...
        </p>
        <p style="line-height: 1.8; margin: 15px 0;">
            Nó trao cho bạn sức mạnh của các 'Thẻ Bài' - chìa khóa để thay đổi số phận!
        </p>
        <div style="margin-top: 20px; padding: 15px; background: rgba(52, 152, 219, 0.2); border-radius: 8px; border: 2px solid #3498db;">
            <strong style="color: #3498db; font-size: 1.2em;">🎯 MỤC TIÊU: Thống nhất toàn bộ Gangbuk!</strong>
            <ul style="margin-top: 15px; padding-left: 25px; line-height: 2;">
                <li><strong>Arc 1:</strong> Chinh phục Phía Tây (100 nhiệm vụ)</li>
                <li><strong>Arc 2:</strong> Thống nhất Đông & Nam (100 nhiệm vụ)</li>
                <li><strong>Arc 3:</strong> Lật đổ Đế chế Phía Bắc (300 nhiệm vụ)</li>
            </ul>
        </div>
        <button class="btn btn-success" onclick="closeModal()" style="margin-top: 20px; width: 100%; font-size: 1.1em;">
            ⚔️ Bắt đầu hành trình!
        </button>
    `;
    
    modal.classList.add('active');
}

// Initialize All Quests (500 quests)
function initializeQuests() {
    // ========== ARC 1: QUEST 1-100 ==========
    
    // Quest 1: Cửa Sổ Hiện Ra
    gameState.quests.push({
        id: 1,
        name: "Cửa Sổ Hiện Ra",
        description: "Chấp nhận hệ thống trong lúc bị bắt nạt sau trường",
        type: "main",
        arc: 1,
        completed: false,
        prerequisites: [],
        rewards: [
            { type: 'stat', name: 'Thẻ Sức mạnh Bronze', rarity: 'bronze', effect: 'strength+1' }
        ],
        points: 15,
        boss: null
    });

    // Quest 2-10: Rèn Luyện Cơ Bản
    for (let i = 2; i <= 10; i++) {
        gameState.quests.push({
            id: i,
            name: `Rèn Luyện Cơ Bản ${i-1}/9`,
            description: "Chuỗi nhiệm vụ: Chạy bộ, hít đất, gập bụng hàng ngày",
            type: "side",
            arc: 1,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 10 ? [
                { type: 'stat', name: 'Thẻ Tốc độ Bronze', rarity: 'bronze', effect: 'speed+1' }
            ] : [],
            points: 10,
            boss: null
        });
    }

    // Quest 11: Bước đầu để trên nên mạnh mẽ
    gameState.quests.push({
        id: 11,
        name: "Bước đầu để trở nên mạnh mẽ",
        description: "Tự mình luyện tập đòn đánh đã nhìn thấy từ Gu Hajun",
        type: "main",
        arc: 1,
        completed: false,
        prerequisites: [10],
        rewards: [
            { type: 'skill', name: 'Jab', rarity: 'bronze', effect: 'damage+10' }
        ],
        points: 15,
        boss: null
    });

    // Quest 12-25: Chống Lại Kẻ Yếu
    for (let i = 12; i <= 25; i++) {
        const hasMinions = i >= 18; // Quest 18-25 có minions
        gameState.quests.push({
            id: i,
            name: `Chống Lại Kẻ Yếu ${i-11}/14`,
            description: hasMinions ? `Đánh bại nhóm ${2 + Math.floor((i-18)/3)} kẻ bắt nạt cấp thấp` : "Đánh bại kẻ bắt nạt cấp thấp",
            type: "side",
            arc: 1,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 25 ? [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Bronze', rarity: 'bronze', effect: 'crew_boost' },
                { type: 'special', name: 'Uy áp', rarity: 'bronze', effect: 'speed_debuff' }
            ] : [],
            points: 10,
            boss: i === 25 ? { name: "Thủ lĩnh nhóm kẻ bắt nạt", stats: [1, 1, 1] } : null,
            minions: hasMinions ? [
                { name: `Kẻ bắt nạt #1`, stats: [0, 0, 0] },
                { name: `Kẻ bắt nạt #2`, stats: [0, 0, 0] },
                ...(i >= 20 ? [{ name: `Kẻ bắt nạt #3`, stats: [0, 0, 0] }] : []),
                ...(i >= 22 ? [{ name: `Kẻ bắt nạt #4`, stats: [0, 0, 0] }] : [])
            ] : null
        });
    }

    // Quest 26: Thu Phục Yang Gukja
    gameState.quests.push({
        id: 26,
        name: "Thu Phục Yang Gukja",
        description: "Giải cứu Gukja khỏi nhóm côn đồ",
        type: "main",
        arc: 1,
        completed: false,
        prerequisites: [25],
        rewards: [
            { type: 'special', name: 'Thành viên Crew: Yang Gukja', rarity: 'silver', effect: 'crew_member_gukja' }
        ],
        points: 20,
        boss: null,
        minions: [
            { name: `Kẻ bắt nạt #1`, stats: [0, 0, 0] },
            { name: `Kẻ bắt nạt #2`, stats: [0, 0, 0] },
        ]
    });

    // Quest 27-40: Huấn Luyện Đội Ngũ
    for (let i = 27; i <= 40; i++) {
        const isLastQuest = (i === 40);
        const cardEffect = i % 2 === 0 ? 'crew_boost' : 'crew_stat+1';
        
        gameState.quests.push({
            id: i,
            name: `Huấn Luyện Đội Ngũ ${i-26}/14`,
            description: `Sử dụng Thẻ Bồi dưỡng để nâng chỉ số Gukja lên mức D (${i-26}/14 hoàn thành)`,
            type: "side",
            arc: 1,
            completed: false,
            prerequisites: [i - 1],
            rewards: [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Silver', rarity: 'silver', effect: cardEffect },
                ...(isLastQuest ? [
                    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost' },
                    { type: 'support', name: 'Healing Bean', rarity: 'bronze', effect: 'heal+10%' }
                ] : [])
            ],
            points: 10,
            boss: null
        });
    }

    // Quest 41: Chạm Trán Gu Hajun
    gameState.quests.push({
        id: 41,
        name: "Chạm Trán Gu Hajun",
        description: "Đối đầu lần đầu với Gu Hajun và chịu thất bại thảm hại",
        type: "main",
        arc: 1,
        completed: false,
        prerequisites: [40],
        rewards: [
            { type: 'special', name: 'Peek at You (Do thám)', rarity: 'silver', effect: 'spy' }
        ],
        points: 20,
        boss: { name: "Gu Hajun (Lần 1)", stats: [6, 5, 6] },
        completeOnLoss: true  // ← Hoàn thành dù thắng hay thua
    });

    // Quest 42-60: Nỗ Lực Tuyệt Vọng
    for (let i = 42; i <= 60; i++) {
        gameState.quests.push({
            id: i,
            name: `Nỗ Lực Tuyệt Vọng ${i-41}/19`,
            description: "Chuỗi 19 nhiệm vụ rèn luyện đặc biệt dưới mưa để tăng Tiềm năng",
            type: "side",
            arc: 1,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 60 ? [
                { type: 'stat', name: 'Tiềm năng +1', rarity: 'silver', effect: 'potential+1' }
            ] : [],
            points: 12,
            boss: null
        });
    }

    // Quest 61: Kẻ Chỉ Điểm
    gameState.quests.push({
        id: 61,
        name: "Kẻ Chỉ Điểm",
        description: "Thu phục quân sư Jang Jihyeok thông qua đấu trí",
        type: "main",
        arc: 1,
        completed: false,
        prerequisites: [60],
        rewards: [
            { type: 'special', name: 'Thành viên: Jang Jihyeok (Quân sư)', rarity: 'silver', effect: 'crew_member_jihyeok' }
        ],
        points: 20,
        boss: null
    });

    // Quest 62-80: Dọn Dẹp Phía Tây
    for (let i = 62; i <= 80; i++) {
        const hasMinions = i >= 68; // Quest 68+ có minions
        const minionCount = 2 + Math.floor((i - 68) / 4); // Tăng số lượng theo tiến độ
        let minionList = [];
        
        if (hasMinions) {
            for (let j = 0; j < minionCount; j++) {
                minionList.push({
                    name: `Thành viên nhóm ${j + 1}`,
                    stats: [1, 0, 0]
                });
            }
        }

        gameState.quests.push({
            id: i,
            name: `Dọn Dẹp Phía Tây ${i-61}/19`,
            description: i >= 69 ? `Tiêu diệt nhóm ${minionCount} kẻ` : "Đánh chiếm các địa bàn nhỏ lẻ của nhóm Gu Hajun quản lý",
            type: "side",
            arc: 1,
            completed: false,
            prerequisites: [i - 1],
            rewards: i % 5 === 0 ? [
                { type: 'stat', name: 'Thẻ Stat Silver', rarity: 'silver', effect: 'random_stat+1' }
            ] : [],
            points: 12,
            boss: null,
            minions: i >= 69 ? minionList : null
        });
    }

    // Quest 81-99: Chuẩn Bị Cuối Cùng
    for (let i = 81; i <= 99; i++) {
        gameState.quests.push({
            id: i,
            name: `Chuẩn Bị Cuối Cùng ${i-80}/19`,
            description: "Đạt chỉ số Sức mạnh và Tốc độ mức C",
            type: "side",
            arc: 1,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 99 ? [
                { type: 'skill', name: 'Low Kick', rarity: 'silver', effect: 'damage+20' },
                { type: 'stat', name: 'Durability +1', rarity: 'silver', effect: 'durability+1' }
            ] : [],
            points: 12,
            boss: null
        });
    }

    // Quest 100: Vị Vua Phía Tây
    gameState.quests.push({
        id: 100,
        name: "👑 Vị Vua Phía Tây",
        description: "Đánh bại Gu Hajun. Thống nhất Phía Tây",
        type: "main",
        arc: 1,
        completed: false,
        prerequisites: [99],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Gold', rarity: 'gold', effect: 'strength+2' },
            { type: 'special', name: 'Thành viên Crew: Gu Hajun', rarity: 'gold', effect: 'crew_member_hajun' }
        ],
        points: 50,
        boss: { name: "Gu Hajun (Final)", stats: [6, 5, 6] }
    });

    // ========== ARC 2: QUEST 101-200 ==========

    // Quest 101: Tê Giác Trỗi Dậy
    gameState.quests.push({
        id: 101,
        name: "Tê Giác Trỗi Dậy",
        description: "Kang Seok (Phía Đông) bắt đầu hành quân tấn công chiếm địa bàn Nam và Tây",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [100],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Platinum', rarity: 'platinum', effect: 'durability+2' }
        ],
        points: 15,
        boss: null
    });

    // Quest 102-120: Đối Đầu Võ Sĩ
    for (let i = 102; i <= 120; i++) {
        const cardRarity = i <= 110 ? 'silver' : (i <= 115 ? 'gold' : 'platinum');
        const isBonus = (i % 5 === 0);
        
        gameState.quests.push({
            id: i,
            name: `Đối Đầu Võ Sĩ ${i-101}/19`,
            description: "Đánh bại các nhóm võ sĩ Wrestling và Judo tại phòng tập Phía Đông",
            type: "side",
            arc: 2,
            completed: false,
            prerequisites: [i - 1],
            rewards: [
                ...(isBonus ? [
                    { type: 'cultivation', name: `Thẻ Bồi dưỡng ${cardRarity.charAt(0).toUpperCase() + cardRarity.slice(1)}`, rarity: cardRarity, effect: 'crew_boost' }
                ] : []),
                ...(i === 120 ? [
                    { type: 'stat', name: 'Thẻ Stat Gold', rarity: 'gold', effect: 'strength+1' },
                    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Platinum', rarity: 'platinum', effect: 'crew_stat+2' }
                ] : [])
            ],
            points: 12,
            boss: null
        });
    }

    // Quest 121: Sức Mạnh Tuyệt Đối
    gameState.quests.push({
        id: 121,
        name: "Sức Mạnh Tuyệt Đối",
        description: "Đối đầu trực diện Kang Seok nhưng bị áp đảo",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [120],
        rewards: [
            { type: 'support', name: 'Iron Skin', rarity: 'gold', effect: 'shield+30%' }
        ],
        points: 20,
        boss: { name: "Kang Seok (Lần 1)", stats: [6, 5, 7] },
        completeOnLoss: true  // ← Hoàn thành dù thắng hay thua
    });

    // Quest 122-140: Rèn Luyện Kỹ Thuật
    for (let i = 122; i <= 140; i++) {
        gameState.quests.push({
            id: i,
            name: `Rèn Luyện Kỹ Thuật ${i-121}/19`,
            description: "Học các kỹ năng khóa người để khắc chế Wrestling",
            type: "side",
            arc: 2,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 140 ? [
                { type: 'skill', name: 'Grappling', rarity: 'gold', effect: 'damage+30' }
            ] : [],
            points: 13,
            boss: null
        });
    }

    // Quest 141-149: Thức Tỉnh Đội Hình
    for (let i = 141; i <= 149; i++) {
        gameState.quests.push({
            id: i,
            name: `Huấn luyện thành viên ${i-140}/9`,
            description: "Giúp Yang Gukja nâng cao chỉ số",
            type: "side",
            arc: 2,
            completed: false,
            prerequisites: [i - 1],
            rewards: [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost' },
                ...(i === 149 ? [
                    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Platinum', rarity: 'platinum', effect: 'crew_stat+2' }
                ] : [])
            ],
            points: 15,
            boss: null
        });
    }

    // Quest 150: Sụp Đổ Phía Đông
    gameState.quests.push({
        id: 150,
        name: "🔥 Sụp Đổ Phía Đông",
        description: "Đánh bại Kang Seok",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [149],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Diamond', rarity: 'diamond', effect: 'all_stats+1' }
        ],
        points: 30,
        boss: { name: "Kang Seok (Awakened)", stats: [7, 6, 8] }
    });

    // Quest 151-165: Lời Tuyên Chiến & Phá Hủy Cơ Sở Ngầm
    for (let i = 151; i <= 165; i++) {
        const isMain = i === 151;
        const isBonus = !isMain && (i % 3 === 0);
        
        gameState.quests.push({
            id: i,
            name: isMain ? "Lời Tuyên Chiến" : `Phá Hủy Cơ Sở Ngầm ${i-151}/14`,
            description: isMain ? "Lên kế hoạch đánh chiếm phía Nam" : "Đột kích phòng Karaoke thuộc quản lý của Phía Nam",
            type: isMain ? "main" : "side",
            arc: 2,
            completed: false,
            prerequisites: [i - 1],
            rewards: isMain ? [
                { type: 'stat', name: 'Thẻ Stat Gold', rarity: 'gold', effect: 'speed+1' }
            ] : (isBonus ? [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost' }
            ] : (i === 165 ? [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Platinum', rarity: 'platinum', effect: 'crew_stat+2' }
            ] : [])),
            points: isMain ? 20 : 12,
            boss: null
        });
    }

    // Quest 166: Cái Bẫy Của Jaeha
    gameState.quests.push({
        id: 166,
        name: "⚠️ Cái Bẫy Của Jaeha",
        description: "Bị dồn vào kho hàng bỏ hoang bởi quân đoàn Phía Nam",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [165],
        rewards: [
            { type: 'special', name: 'Kích hoạt chuỗi Awakened', rarity: 'platinum', effect: 'awakened_trigger' }
        ],
        points: 25,
        boss: { name: "Kang Seok (Awakened)", stats: [7, 6, 8] },
        minions: [
            { name: `Thuộc hạ #1`, stats: [3, 3, 3] },
            { name: `Thuộc hạ #2`, stats: [3, 3, 3] },
        ]
    });

    // Quest 167-179: Vượt Qua Nỗi Sợ
    for (let i = 167; i <= 179; i++) {
        const isBonus = (i % 2 === 0);
        
        gameState.quests.push({
            id: i,
            name: `Vượt Qua Nỗi Sợ ${i-166}/13`,
            description: "Hoàn thành chuỗi thử thách tinh thần trong ký ức",
            type: "side",
            arc: 2,
            completed: false,
            prerequisites: [i - 1],
            rewards: [
                ...(isBonus ? [
                    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost' }
                ] : []),
                ...(i === 179 ? [
                    { type: 'stat', name: 'Thẻ Stat Platinum', rarity: 'platinum', effect: 'intelligence+2' },
                    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Diamond', rarity: 'diamond', effect: 'crew_stat+3' }
                ] : [])
            ],
            points: 15,
            boss: null
        });
    }

    // Quest 180: Thức Tỉnh Đầu Tiên (AWAKENED)
    gameState.quests.push({
        id: 180,
        name: "⚡ THỨC TỈNH ĐẦU TIÊN - AWAKENED ⚡",
        description: "MC đột phá Awakened trong trận chiến kho hàng",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [179],
        rewards: [
            { type: 'skill', name: 'Cuồng thú', rarity: 'diamond', effect: 'damage+40' }
        ],
        points: 50,
        boss: null
    });

    // Quest 181-196: Truy Quét Lãnh Đạo
    for (let i = 181; i <= 196; i++) {
        gameState.quests.push({
            id: i,
            name: `Truy Quét Lãnh Đạo ${i-180}/17`,
            description: "Đánh bại các lãnh đạo của Phía Nam để cô lập Jaeha",
            type: "side",
            arc: 2,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 196 ? [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost_gold' }
            ] : [],
            points: 15,
            boss: i % 5 === 0 ? { name: `No.${5 - Math.floor((i-185)/5)} Phía Nam`, stats: [5, 5, 5] } : null
        });
    }

    // Quest 197: Dưới Trướng Phía Tây
    gameState.quests.push({
        id: 197,
        name: "🎯 Dưới Trướng Phía Tây",
        description: "Đánh bại Han Jaeha",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [196],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Bạch kim', rarity: 'platinum', effect: 'all_stats+2' }
        ],
        points: 35,
        boss: { name: "Han Jaeha", stats: [6, 6, 6] }
    });

    // Quest 198: Han Jeaha thức tỉnh
    gameState.quests.push({
        id: 198,
        name: "⚡ Han Jaeha thức tỉnh",
        description: "Han Jaeha thức tỉnh sức mạnh sau khi bị MC đánh bại",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [197],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Bạch kim', rarity: 'platinum', effect: 'all_stats+2' }
        ],
        points: 35,
        boss: { name: "Han Jaeha", stats: [8, 8, 7] }
    });

    // Quest 199: Sự phản bội bất ngờ
    gameState.quests.push({
        id: 199,
        name: "⚠️ Sự phản bội bất ngờ",
        description: "No.2 Phía Nam (Sigyeong Ryu) phản bội Han Jeaha, để lộ thân phận thực sự là No.10 phía Bắc",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [198],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Platinum', rarity: 'platinum', effect: 'speed+1' }
        ],
        points: 30,
        boss: null,
        hasChoice: true  // ← Mark this quest as having a choice
    });

    // Quest 200: Kết quả của sự lựa chọn
    gameState.quests.push({
        id: 200,
        name: "👑 Kết quả của sự lựa chọn",
        description: "Chọn Ryu: Đánh bại Jeaha, tuy nhiên bị No.1 Bắc Choyun để ý. Chọn Jeaha: Chống trả Ryu nhưng thất bại thảm hại (không thể hạ gục Ryu)",
        type: "main",
        arc: 2,
        completed: false,
        prerequisites: [199],
        rewards: [
            { type: 'special', name: 'Danh hiệu: Bá Chủ Ba Phương', rarity: 'diamond', effect: 'title_three_kings' },
            { type: 'stat', name: 'Thẻ chỉ số Kim Cương', rarity: 'diamond', effect: 'all_stats+3' }
        ],
        points: 50,
        boss: { name: "Sigyeong Ryu (No.10 Phía Bắc)", stats: [100, 100, 100], isUnbeatable: true },
        completeOnLoss: true  // ← Hoàn thành dù thắng hay thua
    });

    // ========== ARC 3: QUEST 201-500 ==========
    
    // Giai đoạn 1: Quét sạch ngoại vi (201-300)
    
    // Quest 201-240: Chiến dịch Cửa ngõ
    for (let i = 201; i <= 240; i++) {
        const bossNum = 40 - Math.floor((i-201)/2);
        const isEven = i % 2 === 0;
        
        gameState.quests.push({
            id: i,
            name: isEven ? `⚔️ Đánh bại No.${bossNum} Phía Bắc` : `Chiến dịch Cửa ngõ ${Math.floor((i-200)/2)}/20`,
            description: isEven ? `Trận chiến 1v1 đánh bại No.${bossNum} Phía Bắc` : "Phá hủy trạm gác để lộ diện Boss",
            type: isEven ? "main" : "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: isEven ? [
                { type: 'stat', name: 'Thẻ Stat Platinum', rarity: 'platinum', effect: 'random_stat+1' },
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost' }
            ] : [],
            points: isEven ? 20 : 12,
            boss: isEven ? { name: `No.${bossNum} Phía Bắc`, stats: [3 + Math.floor((i-201)/10), 2 + Math.floor((i-201)/10), 3 + Math.floor((i-201)/10)] } : null
        });
    }

    // Quest 241-260: Bóng ma Phía Bắc
    for (let i = 241; i <= 260; i++) {
        gameState.quests.push({
            id: i,
            name: `Bóng ma Phía Bắc ${i-240}/20`,
            description: "Chuỗi 20 nhiệm vụ do thám: Tìm hiểu bí mật về No.1 Bắc",
            type: "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 260 ? [
                { type: 'special', name: 'Spy Card', rarity: 'diamond', effect: 'advanced_spy' }
            ] : [],
            points: 15,
            boss: null
        });
    }

    // Quest 261-280: Cắt đứt huyết mạch
    for (let i = 261; i <= 280; i++) {
        gameState.quests.push({
            id: i,
            name: `Cắt đứt huyết mạch ${i-260}/20`,
            description: "Đột kích và phá hủy cơ sở kinh doanh ngầm (Club/Billiard) đang cung cấp tài chính cho quân đội Phía Bắc",
            type: "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i % 5 === 0 ? [
                { type: 'support', name: 'Thuốc hồi phục', rarity: 'diamond', effect: 'heal+30%' }
            ] : [],
            points: 15,
            boss: null
        });
    }

    // Quest 281-298: Phòng tuyến thép
    for (let i = 281; i <= 298; i++) {
        gameState.quests.push({
            id: i,
            name: `Phòng tuyến thép ${i-280}/19`,
            description: "Bảo vệ địa bàn khỏi các cuộc tập kích bất ngờ",
            type: "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i % 5 === 0 ? [
                { type: 'stat', name: 'Thẻ Stat Diamond', rarity: 'diamond', effect: 'random_stat+2' }
            ] : [],
            points: 15,
            boss: null,
            minions: [
                { name: `Thuộc hạ phía Bắc #1`, stats: [6, 6, 6] },
                { name: `Thuộc hạ phía Bắc #2`, stats: [6, 6, 6] },
                { name: `Thuộc hạ phía Bắc #3`, stats: [6, 6, 6] },
                { name: `Thuộc hạ phía Bắc #4`, stats: [6, 6, 6] },
            ]
        });
    }

    // Quest 299: Bế quan tu luyện
    gameState.quests.push({
        id: 299,
        name: "🧘 Bế quan tu luyện",
        description: "MC cùng các nhân vật chủ chốt bế quan tu luyện trong 3 tháng, nâng chỉ số lên mức SSR",
        type: "side",
        arc: 3,
        completed: false,
        prerequisites: [298],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Diamond x3', rarity: 'diamond', effect: 'all_combat_stats+3' },
            { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'diamond', effect: 'crew_ssr' }
        ],
        points: 30,
        boss: null
    });

    // Quest 300: Ảo ảnh giới hạn
    gameState.quests.push({
        id: 300,
        name: "💫 Ảo ảnh giới hạn",
        description: "[Nhiệm vụ điều kiện] Đối đầu với bản sao có chỉ số tương đương MC để vượt qua rào cản tinh thần",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [299],
        rewards: [
            { type: 'skill', name: 'Berserker', rarity: 'master', effect: 'damage+50' },
            { type: 'stat', name: 'Potential lên S', rarity: 'master', effect: 'potential_max' }
        ],
        points: 50,
        boss: { name: "Bản sao của MC", stats: [8, 8, 8] }
    });

    // Giai đoạn 2: Vùng trung tâm & Ngũ hổ tướng (301-400)
    
    // Quest 301-350: Nội đô rực lửa
    for (let i = 301; i <= 350; i++) {
        const bossNum = 20 - Math.floor((i-301)/10);
        const isBoss = i % 10 === 0;
        
        gameState.quests.push({
            id: i,
            name: isBoss ? `⚔️ Đánh bại No.${bossNum} Phía Bắc` : `Nội đô rực lửa ${i-300}/50`,
            description: isBoss ? `Hạ gục No.${bossNum} Phía Bắc` : "Chiếm đóng các Penthouse và trung tâm huấn luyện",
            type: isBoss ? "main" : "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 350 ? [
                { type: 'stat', name: 'Thẻ Stat Diamond', rarity: 'diamond', effect: 'all_stats+2' },
                { type: 'skill', name: 'Kali Arnis', rarity: 'master', effect: 'damage+50' }
            ] : (isBoss ? [
                { type: 'stat', name: 'Thẻ Stat Diamond', rarity: 'diamond', effect: 'random_stat+2' }
            ] : []),
            points: isBoss ? 25 : 15,
            boss: isBoss ? { name: `No.${bossNum} Phía Bắc`, stats: [8, 8, 8] } : null
        });
    }

    // Quest 351: Diệt Ngũ Hổ Tướng
    gameState.quests.push({
        id: 351,
        name: "Chạm chán Ngũ Hổ Tướng",
        description: "Sức mạnh của Ngũ Hỗ Tướng",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [350],
        rewards: [
            { type: 'skill', name: 'Taekkyeon', rarity: 'master', effect: 'damage+80' }
        ],
        points: 50,
        boss: { name: "No.15 Hong Baekgi", stats: [9, 9, 9] }
    });

    // Quest 352: Diệt Ngũ Hổ Tướng (2)
    gameState.quests.push({
        id: 352,
        name: "Chạm chán Ngũ Hổ Tướng (2)",
        description: "Sức mạnh của Ngũ Hỗ Tướng",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [351],
        rewards: null,
        points: 50,
        boss: { name: "No.14 Do Minu", stats: [10, 9, 9] }
    });

    // Quest 353: Diệt Ngũ Hổ Tướng (3)
    gameState.quests.push({
        id: 353,
        name: "Chạm chán Ngũ Hổ Tướng (3)",
        description: "Sức mạnh của Ngũ Hỗ Tướng",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [352],
        rewards: null,
        points: 50,
        boss: { name: "No.13 Lim Taehyeong", stats: [10, 9, 10] }
    });

    // Quest 354: Diệt Ngũ Hổ Tướng (4)
    gameState.quests.push({
        id: 354,
        name: "Chạm chán Ngũ Hổ Tướng (4)",
        description: "Sức mạnh của Ngũ Hỗ Tướng",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [353],
        rewards: null,
        points: 50,
        boss: { name: "No.12 Ji Eunhyeong", stats: [9, 10, 9] }
    });

    // Quest 355: Diệt Ngũ Hổ Tướng (5)
    gameState.quests.push({
        id: 355,
        name: "Chạm chán Ngũ Hổ Tướng (5)",
        description: "Sức mạnh của Ngũ Hỗ Tướng",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [354],
        rewards: [
            { type: 'special', name: 'Ascendant Power', rarity: 'master', effect: 'ascendant_breakthrough' },
        ],
        points: 50,
        boss: { name: "No.11 Heo Jintae", stats: [10, 10, 9] }
    });
    // Quest 352-359: Cuộc tập kích bất ngờ & Đánh bại No.11
    const specialQuests = [
        { id: 356, name: "🎲 Cú lật kèo bất ngờ", desc: "Choyun dùng thẻ đánh đổi lên No.11, tăng chỉ số lên LR" },
        { id: 357, name: "⚡ Đánh bại No.11", desc: "MC buộc phải sử dụng Thẻ kỹ năng chuyên biệt, nâng sức mạnh lên MR" },
        { id: 358, name: "💀 Cuộc gặp gỡ bất ngờ", desc: "Sau khi đánh bại No.11, MC chạm trán No.3 Ma Jeongdu" },
        { id: 359, name: "🏃 Rút lui", desc: "MC cùng các thành viên chỉ còn cách rút lui trước No.3" }
    ];

    specialQuests.forEach((quest, index) => {
        const rewards = [];
        if (quest.id === 357) {
            rewards.push(
                { type: 'support', name: 'Mana Drain', rarity: 'master', effect: 'heal+50%' },
                { type: 'special', name: 'Địa bàn của Ngũ hổ tướng', rarity: 'diamond', effect: 'territory_five_tigers' }
            );
        } else if (quest.id === 359) {
            rewards.push(
                { type: 'stat', name: 'Thẻ Stat Kim cương', rarity: 'diamond', effect: 'all_stats+2' },
                { type: 'special', name: 'Kho thẻ', rarity: 'master', effect: 'card_shop' }
            );
        }

        gameState.quests.push({
            id: quest.id,
            name: quest.name,
            description: quest.desc,
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [quest.id - 1],
            rewards: rewards,
            points: 25,
            boss: quest.id === 357 ? { name: "No.11 Heo Jintae (Powered)", stats: [12, 12, 12] } : null
        });

        gameState.quests.push({
            id: quest.id,
            name: quest.name,
            description: quest.desc,
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [quest.id - 1],
            rewards: rewards,
            points: 25,
            boss: quest.id === 358 ? { name: "No.3 Ma Jeongdu", stats: [17, 16, 17] } : null,
            completeOnLoss: true  // ← Hoàn thành dù thắng hay thua
        });
    });

    // Quest 360: Bồi dưỡng thành viên
    gameState.quests.push({
        id: 360,
        name: "📈 Bồi dưỡng thành viên",
        description: "MC cùng các thành viên lập kế hoạch chuẩn bị bước vào trận chiến cuối cùng",
        type: "side",
        arc: 3,
        completed: false,
        prerequisites: [359],
        rewards: [
            { type: 'cultivation', name: 'Thẻ Bồi dưỡng Master', rarity: 'master', effect: 'crew_s_rank' }
        ],
        points: 30,
        boss: null
    });

    // Quest 361-390: Con đường làm chủ
    for (let i = 361; i <= 390; i++) {
        gameState.quests.push({
            id: i,
            name: `Con đường làm chủ ${i-360}/30`,
            description: "Path to Mastery - MC đi săn những thuộc hạ của Choyun, hấp thụ năng lượng để tăng chỉ số",
            type: "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 390 ? [
                { type: 'stat', name: 'Thẻ Stat Master', rarity: 'master', effect: 'all_stats+3' }
            ] : [],
            points: 18,
            boss: null
        });
    } 

    // Quest 391-399: Phá vỡ tẩy não
    for (let i = 391; i <= 399; i++) {
        gameState.quests.push({
            id: i,
            name: `Phá vỡ tẩy não ${i-390}/9`,
            description: "Giải cứu học sinh bị thẻ 'Chain of Indoctrination' của Choyun khống chế",
            type: "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 399 ? [
                { type: 'support', name: 'Nullify', rarity: 'master', effect: 'heal+50%' }
            ] : [],
            points: 18,
            boss: null
        });
    }

    // Quest 400: Lời mời từ Daniel
    gameState.quests.push({
        id: 400,
        name: "🤝 Lời mời từ Daniel",
        description: "[Nhiệm vụ điều kiện] Cuộc gặp gỡ bí mật với No.2 Daniel, tiến hành đàm phán lên kế hoạch chống trả Choyun",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [399],
        rewards: [
            { type: 'special', name: 'Fateful Meeting', rarity: 'master', effect: 'alliance_daniel' }
        ],
        points: 40,
        boss: null
    });

    // Giai đoạn 3: Giới tinh hoa Top 10 (401-480)
    
    // Quest 401-410: Đánh chiếm lãnh thổ
    for (let i = 401; i <= 410; i++) {
        gameState.quests.push({
            id: i,
            name: `Đánh chiếm lãnh thổ ${i-400}/10`,
            description: "Lần lượt tiến quân lên phía Bắc, đánh chiếm những địa bàn lân cận của Ngũ hộ tướng",
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 410 ? [
                { type: 'cultivation', name: 'Thẻ Bồi dưỡng Master', rarity: 'master', effect: 'crew_master' }
            ] : [],
            points: 20,
            boss: null
        });
    }

    // Quest 411-414: Bí mật của No.7 & Tê giác thức tỉnh
    const no7Quests = [
        { id: 411, name: "⚠️ Bí mật của No.7 Lữ bố Teaho Cheon", desc: "No.7 Cheon Teaho 1 mình xông pha vào lãnh thổ phía Tây" },
        { id: 412, name: "💥 Sức mạnh thực sự của No.7", desc: "No.7 bộc phát năng lực thực sự, chỉ số Sức mạnh và Chịu đòn ở mức X" },
        { id: 413, name: "🦏 Tê giác thức tỉnh", desc: "Kang Seok đột phá Ascendant, chỉ số tăng lên UR, sở hữu thẻ 'Tê giác vô địch'" },
        { id: 414, name: "🧠 Quân sư của Lữ bố", desc: "Cheon Teaho rút lui theo chỉ thị của No.8 Ha Seonu" }
    ];

    no7Quests.forEach(quest => {
        const rewards = [];
        if (quest.id === 411) rewards.push({ type: 'stat', name: 'Thẻ Stat Diamond', rarity: 'diamond', effect: 'all_stats+2' });
        if (quest.id === 412) rewards.push({ type: 'special', name: 'Card Buffet', rarity: 'master', effect: 'card_buffet' });
        if (quest.id === 413) rewards.push(
            { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'master', effect: 'seok_ascendant' },
            { type: 'stat', name: 'Thẻ Stat', rarity: 'master', effect: 'strength+3' }
        );
        if (quest.id === 414) rewards.push({ type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'diamond', effect: 'crew_boost' });

        gameState.quests.push({
            id: quest.id,
            name: quest.name,
            description: quest.desc,
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [quest.id - 1],
            rewards: rewards,
            points: 25,
            boss: quest.id === 412 ? { name: "No.7 Cheon Teaho", stats: [14, 13, 14] } : null
        });
    });

    // Quest 415-430: Sự trả thù của Han Jeaha
    for (let i = 415; i <= 430; i++) {
        let questName, questDesc;
        if (i === 415) {
            questName = "😈 Sự trả thù của Han Jeaha";
            questDesc = "Han Jeaha lên kế hoạch, tự mình dẫn quân và đặt bẫy cho No.10 Ryu";
        } else if (i >= 416 && i <= 425) {
            questName = `Sự trả thù của Han Jeaha (2) ${i-415}/10`;
            questDesc = "Han Jeaha dụ No.10 Ryu đến căn cứ đã giăng bẫy sẵn";
        } else if (i >= 426 && i <= 428) {
            questName = `No.10 Sigyeong Ryu thức tỉnh ${i-425}/3`;
            questDesc = "Sau khi trải nghiệm sự phản bội, Ryu đã đột phá Ascendant, tăng chỉ số từ SSR lên LR";
        } else {
            questName = i === 429 ? "⚔️ Kết quả trận chiến (1)" : "⚔️ Kết quả trận chiến (2)";
            questDesc = "No.10 Sigyeong Ryu vs No.4 Han Jeaha (Quân Sư) - Cuộc chiến khốc liệt";
        }

        gameState.quests.push({
            id: i,
            name: questName,
            description: questDesc,
            type: (i === 415 || i >= 426) ? "main" : "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 430 ? [
                { type: 'stat', name: 'Thẻ Stat Master', rarity: 'master', effect: 'all_stats+3' },
                { type: 'special', name: 'Địa bàn của Ryu', rarity: 'master', effect: 'territory_ryu' }
            ] : [],
            points: (i === 415 || i >= 426) ? 25 : 18,
            boss: i === 430 ? { name: "No.10 Sigyeong Ryu (Powered)", stats: [13, 12, 13] } : null
        });
    }

    // Quest 431-432: Tri kỷ đối đầu & Bá vương trỗi dậy
    gameState.quests.push({
        id: 431,
        name: "💔 Tri kỷ đối đầu",
        description: "Daniel hành động theo chỉ thị của Choyun, đã chạm mặt Hajun. Daniel lộ diện chỉ số",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [430],
        rewards: [
            { type: 'special', name: 'Chỉ số của No.2', rarity: 'challenger', effect: 'reveal_daniel_stats' }
        ],
        points: 30,
        boss: { name: "No.2 Daniel", stats: [15, 16, 15] },
        completeOnLoss: true  // ← Hoàn thành dù thắng hay thua
    });

    gameState.quests.push({
        id: 432,
        name: "👑 Bá vương trỗi dậy",
        description: "Hajun đột phá Ascendant, chỉ số tăng lên X, mở khóa thẻ độc quyền 'Bá vương'",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [431],
        rewards: [
            { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'master', effect: 'hajun_ascendant' },
            { type: 'stat', name: 'Thẻ Stat', rarity: 'master', effect: 'strength+3' }
        ],
        points: 35,
        boss: { name: "No.2 Daniel", stats: [15, 16, 15] }
    });

    // Quest 433-445: Đối đầu No.9 & Đánh bại No.9
    for (let i = 433; i <= 445; i++) {
        const isMain = i >= 441;
        gameState.quests.push({
            id: i,
            name: isMain ? `⚔️ Đánh bại No.9 Uijin Gyeong ${i-440}/5` : `Đối đầu đội quân của No.9 ${i-432}/8`,
            description: isMain ? "Sau khi đánh bại toàn bộ đội quân, MC dùng 'Mana Drain', đối đầu với Gyeong" : "No.9 Uijin Gyeong sở hữu đội quân đông đảo nhất, lên đến hơn 300 người",
            type: isMain ? "main" : "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 440 ? [
                { type: 'skill', name: 'War Cry', rarity: 'master', effect: 'damage+50' }
            ] : (i === 445 ? [
                { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'master', effect: 'gyeong_join' },
                { type: 'stat', name: 'Thẻ Stat', rarity: 'master', effect: 'all_stats+2' },
                { type: 'skill', name: 'Resonant', rarity: 'master', effect: 'damage+60' }
            ] : []),
            points: isMain ? 25 : 18,
            boss: i === 445 ? { name: "No.9 Uijin Gyeong", stats: [12, 12, 13] } : null
        });
    }

    // Quest 446-450: Chinh phục Lữ bố và Quân sư
    for (let i = 446; i <= 450; i++) {
        if (i === 450) {
            // Quest 450: 2-Boss Battle
            gameState.quests.push({
                id: 450,
                name: `🎯 Chinh phục Lữ bố và Quân sư ${i-445}/5`,
                description: "Nhờ sự trợ giúp của Gyeong với đội quân hơn 300 người, MC đã kết hợp cùng các thành viên đánh bại Seonu và Teaho",
                type: "main",
                arc: 3,
                completed: false,
                prerequisites: [i - 1],
                rewards: [
                    { type: 'special', name: 'Đồng đội mới: Seonu và Teaho', rarity: 'master', effect: 'crew_seonu_teaho' },
                    { type: 'special', name: 'Địa bàn của Seonu và Teaho', rarity: 'master', effect: 'territory_st' }
                ],
                points: 30,
                boss: null,
                bosses: [
                    { name: "No.8 Ha Seonu", stats: [12, 12, 11] },
                    { name: "No.7 Cheon Teaho", stats: [14, 13, 14] }
                ]
            });
        } else {
            gameState.quests.push({
                id: i,
                name: `🎯 Chinh phục Lữ bố và Quân sư ${i-445}/5`,
                description: "Nhờ sự trợ giúp của Gyeong với đội quân hơn 300 người, MC đã kết hợp cùng các thành viên đánh bại Seonu và Teaho",
                type: "main",
                arc: 3,
                completed: false,
                prerequisites: [i - 1],
                rewards: [],
                points: 30,
                boss: null
            });
        }
    }

    // Quest 451-460: Quái vật bậc X
    for (let i = 451; i <= 460; i++) {
        const bossNum = 6 - Math.floor((i-451)/3);
        gameState.quests.push({
            id: i,
            name: `👹 Quái vật phía Bắc - No.${bossNum} ${((i-451) % 3) + 1}/3`,
            description: "Đánh bại No.6 đến No.4. Đối thủ sở hữu ít nhất 1 chỉ số bậc X",
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i % 3 === 0 ? [
                { type: 'stat', name: 'Thẻ Stat Master', rarity: 'master', effect: 'all_stats+3' },
                { type: 'support', name: 'Senzu bean', rarity: 'challenger', effect: 'full_heal' }
            ] : [],
            points: 30,
            boss: i % 3 === 0 ? { name: `No.${bossNum} Phía Bắc`, stats: [14, 14, 14] } : null
        });
    }

    // Quest 461-480: Choyun hành động
    for (let i = 461; i <= 480; i++) {
        const isMain = i === 461 || i === 480;
        gameState.quests.push({
            id: i,
            name: isMain ? (i === 461 ? "🔥 BỨC TƯỜNG THÉP - NO.3 BẮC 🔥" : "") : `Choyun hành động ${i-460}/20`,
            description: isMain ? (i === 461 ? "Đánh bại No.3 Phía Bắc" : "Choyun dẫn quân đi đánh chiếm lại các cứ điểm chủ chốt") : "Choyun sử dụng chiến thuật phân tán lực lượng, đánh chiếm lại các cứ điểm đã mất",
            type: isMain ? "main" : "side",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: isMain ? [
                { type: 'special', name: i === 461 ? 'Thẻ Challenger' : 'Chuẩn bị Transcendent', rarity: 'challenger', effect: i === 461 ? 'power_boost' : 'ready_transcendent' }
            ] : [],
            points: isMain ? 50 : 20,
            boss: isMain ? { name: "No.3 Ma Jeongdu", stats: [15, 14, 16] } : null
        });
    }

    // Giai đoạn 4: TRẬN CHIẾN SIÊU VIỆT CUỐI CÙNG (481-500)
    
    // Quest 481: Phản công
    gameState.quests.push({
        id: 481,
        name: "🎯 Phản công",
        description: "MC đã chia các lãnh đạo ra nhiều hướng, đánh chiếm lại các cứ điểm mà Choyun đã lấy lại trước đó, sau đó tạo thể gọng kìm, áp sát để tiến đánh Choyun.",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [480],
        rewards: [
            { type: 'stat', name: 'Thẻ Stat Master', rarity: 'master', effect: 'all_stats+3' }
        ],
        points: 35,
        boss: null
    });

    // Quest 482-485: No.3 Thái sơn Jeongdu Ma
    for (let i = 482; i <= 485; i++) {
        gameState.quests.push({
            id: i,
            name: `🔥 No.3 Thái sơn Ma Jeongdu ${i-481}/4`,
            description: "Trận chiến với No.3 Ma Jeongdu. Gukja đã ở lại đối đầu với Jeongdu, với sự cách biệt chỉ số, Gukja đã thất bại, kích hoạt Ascendant, chỉ số tăng lên MR, sở hữu thẻ kỹ năng độc quyền 'Vô thức', tiến vào trạng thái Vô thức, tự động chiến đấu, chỉ số tăng mạnh.",
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 485 ? [
                { type: 'stat', name: 'Thẻ Stat Master', rarity: 'master', effect: 'all_stats+4' },
                { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'master', effect: 'gukja_ascendant' },
                { type: 'skill', name: 'Vô thức', rarity: 'master', effect: 'damage+100' }
            ] : [],
            points: 35,
            boss: i === 485 ? { name: "No.3 Ma Jeongdu", stats: [17, 16, 18] } : null
        });
    }

    // Quest 486-490: Đối đầu Choyun
    for (let i = 486; i <= 490; i++) {
        gameState.quests.push({
            id: i,
            name: `⚡ Đối đầu Choyun ${i-485}/5`,
            description: "MC cùng các thành viên chủ chốt (Hajun, Jeaha, Seok, Teaho) đối đầu với Choyun, nhưng Choyun sở hữu chỉ số quá mạnh, Sức mạnh, Chịu đòn ở mức DX, Tốc độ EX. MC cùng các thành viên cơ bản không phải đối thủ, khi sắp bị đánh bại, Choyun nhận ra Daniel đã phản bội.",
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: i === 490 ? [
                { type: 'special', name: 'Thẻ Challenger', rarity: 'challenger', effect: 'choyun_betrayal' }
            ] : [],
            points: 35,
            boss: { name: "👹 No.1 Choyun", stats: [17, 17, 18] }
        });
    }

    // Quest 491: Daniel đối đầu Choyun
    gameState.quests.push({
        id: 491,
        name: "💔 Daniel đối đầu Choyun",
        description: "Đối đầu với 1 Choyun hùng mạnh, Daniel dựa vào kinh nghiệm khi quan sát thói quen chiến đấu của Choyun, đánh làm cho Choyun có 1 chút bất ngờ, nhưng vì sự áp đảo chỉ số, Choyun đã lấy lại thế trận, đánh bại Daniel.",
        type: "side",
        arc: 3,
        completed: false,
        prerequisites: [490],
        rewards: [],
        points: 20,
        boss: null
    });

    // Quest 492: Sự thức tỉnh của Daniel
    gameState.quests.push({
        id: 492,
        name: "⭐ Sự thức tỉnh của Daniel",
        description: "Daniel sau khi bị đánh bại, vì mong muốn đánh bại Choyun, đã đột phá Ascendant, chỉ số Sức mạnh, Tốc độ, Chịu đòn tăng lên mức EX. Daniel liên tục gây sát thương chí lạng lên Choyun, nhưng Choyun đã dùng thẻ Stat, tăng mạnh chỉ số từ DX lên ???, 1 kích đã đánh cho Daniel mất ý thức, tẩy não Daniel.",
        type: "side",
        arc: 3,
        completed: false,
        prerequisites: [491],
        rewards: [],
        points: 20,
        boss: null
    });

    // Quest 493: Đuổi theo Choyun
    gameState.quests.push({
        id: 493,
        name: "🏃 Đuổi theo Choyun",
        description: "Choyun sau khi trọng thương bởi Daniel, đã phải trốn ở căn cứ để tiến hành phục hồi. MC đã đuổi đến nơi, nhưng đã bị Daniel (bị tẩy não) đánh chặn. MC cùng đồng đội không phải đối thủ, nhưng Hajun đã chủ động đứng lên 1 mình chống trả.",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [492],
        rewards: [],
        points: 30,
        boss: null
    });

    // Quest 494: Bá vương VS Daniel
    gameState.quests.push({
        id: 494,
        name: "👑 Bá vương VS Daniel",
        description: "Hajun đã quyết định ở lại để đối đầu với Daniel (EX), nhưng chỉ số cách biệt quá lớn, Hajun đã bị đánh gục rất nhanh, ngay thời khắc Daniel ra đòn quyết định, ý chí của bản thân Daniel đã dừng cơ thể lại. Hajun thấy vậy, đã Thăng thiên, đột phá Transcendent, chỉ số tăng mạnh lên mức EX, sử dụng thẻ kỹ năng độc quyền 'Bá vương' đã nâng cấp, đánh bại Daniel.",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [493],
        rewards: [
            { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'master', effect: 'hajun_transcendent' },
            { type: 'stat', name: 'Thẻ Stat Master', rarity: 'master', effect: 'strength+5' }
        ],
        points: 40,
        boss: { name: "No.2 Daniel", stats: [17, 18, 17] }
    });

    // Quest 495: Đội quân của Choyun
    gameState.quests.push({
        id: 495,
        name: "🎖️ Đội quân của Choyun",
        description: "Sau khi để Hajun lại phía sau và tiến vào trong căn cứ, MC và các thành viên bất ngờ gặp phải đội quân của Choyun, toàn là những thành viên sở hữu chỉ số từ MR – XX. MC sử dụng thẻ 'Mana Drain' để hút chỉ số từ các thành viên trong đội quân của Choyun. Sau khi đánh bại hết, MC cũng đã gia tăng chỉ số của mình lên mức EX.",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [494],
        rewards: [
            { type: 'skill', name: 'Gigaton Obliteration', rarity: 'master', effect: 'damage+200' }
        ],
        points: 35,
        boss: null,
        minions: [
            { name: `Thuộc hạ của Choyun #1`, stats: [15, 15, 15] },
            { name: `Thuộc hạ của Choyun #2`, stats: [15, 15, 15] },
            { name: `Thuộc hạ của Choyun #3`, stats: [15, 15, 15] },
            { name: `Thuộc hạ của Choyun #4`, stats: [15, 15, 15] }
        ]
    });

    // Quest 496-497: Đụng độ Choyun
    for (let i = 496; i <= 497; i++) {
        gameState.quests.push({
            id: i,
            name: `💥 Đụng độ Choyun ${i-495}/2`,
            description: "Sau khi đánh bại đội quân của Choyun, MC cùng các thành viên đã đến căn phòng nơi Choyun đang ở. Choyun đã kịp thời hồi phục, chỉ số của hắn lúc này là ???. Áp lực từ hắn đã làm cho MC cùng các thành viên thấy nặng nề.",
            type: "main",
            arc: 3,
            completed: false,
            prerequisites: [i - 1],
            rewards: [],
            points: 30,
            boss: null
        });
    }

    // Quest 498: Sức mạnh của No.1 Choyun
    gameState.quests.push({
        id: 498,
        name: "⚡ Sức mạnh của No.1 Choyun",
        description: "Cách biệt của chỉ số là quá lớn, các thành viên của MC dù có thăng hoa, đột phá Transcendent cũng không phải là đối thủ của hắn. Thậm chí MC cũng đã bị đả thương nghiêm trọng. MC khi thấy Choyun chuẩn bị ra đòn kết liễu, trong thâm tâm đã trỗi dậy, những ký ức cũ vụt qua, những hình ảnh của người bạn hiện lên. MC đã thăng hoa, đột phá Transcendent, chỉ số tăng đến mức ???.",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [497],
        rewards: [
            { type: 'cultivation', name: 'Thẻ bồi dưỡng', rarity: 'challenger', effect: 'mc_transcendent' }
        ],
        points: 50,
        boss: { name: "👹 No.1 Choyun", stats: [20, 20, 20] }
    });

    // Quest 499: Trận chiến cuối cùng
    gameState.quests.push({
        id: 499,
        name: "🔥 TRẬN CHIẾN CUỐI CÙNG 🔥",
        description: "Choyun bất ngờ vì sự thức tỉnh của MC, hắn đã bị MC đánh trọng thương. Vì bản thân hắn có mong muốn mãnh liệt là thống nhất Gangbuk, hắn cũng đã thăng hoa, đột phá Transcendent, tăng mạnh chỉ số. MC bị khí thế của Choyun áp đảo, đã sử dụng thẻ 'Đánh đổi' lên bản thân, đổi Trí tuệ và Tiềm năng đổi lấy Sức mạnh, Tốc độ và Chịu đòn lên ngang tầm với Choyun. MC lúc này như 1 cỗ máy chiến đấu, không còn ý thức để làm chủ bản thân.",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [498],
        rewards: [],
        points: 50,
        boss: null
    });

    // Quest 500: Chốt hạ - FINAL BOSS
    gameState.quests.push({
        id: 500,
        name: "👑 CHỐT HẠ - THỐNG NHẤT GANGBUK 👑",
        description: "Choyun bị áp đảo bởi thẻ 'Đánh đổi' của MC, đã lập tức dùng 'Thanh tẩy', xóa bỏ hiệu ứng của thẻ 'Đánh đổi'. MC lây lại ý thức, Trí tuệ và Tiềm năng quay trở lại mức S, tuy nhiên Sức mạnh, Tốc độ và Chịu đòn không bị mất đi. MC sau đó thừa thời cơ, đánh gục Choyun, sử dụng thẻ 'Ngàn cân', tăng trọng lượng cơ thể lên gấp 5 lần, liên tục giáng những đòn đánh Ngàn cân lên Choyun. Chính thức thống nhất Gangbuk!",
        type: "main",
        arc: 3,
        completed: false,
        prerequisites: [499],
        rewards: [
            { type: 'special', name: 'Thống nhất Gangbuk', rarity: 'challenger', effect: 'gangbuk_unified' },
            { type: 'special', name: 'Danh hiệu: Vua Gangbuk', rarity: 'challenger', effect: 'title_gangbuk_king' }
        ],
        points: 100,
        boss: { name: "👹 No.1 Choyun (Transcendent)", stats: [30, 30, 30] }
    });

    // Auto-assign challenges to non-combat quests
    gameState.quests.forEach(quest => {
        // Skip quests that already have combat or challenges
        if (quest.boss || quest.minions || quest.challengeType) return;
        
        // Skip story choice quests
        if (quest.hasChoice) return;
        
        const title = quest.name.toLowerCase();
        const description = (quest.description || '').toLowerCase();
        
        // We'll generate contextual quiz questions using the question bank
        
        // QTE for training/practice quests
        if (title.includes('rèn luyện') || title.includes('luyện tập') || title.includes('tập') ||
            title.includes('train') || description.includes('rèn')) {
            quest.challengeType = 'qte';
            quest.challengeData = {
                rounds: 3,
                speed: quest.id < 50 ? 2500 : (quest.id < 200 ? 2000 : 1500)
            };
            if (/bắt nạt|kẻ bắt nạt|bully/.test(title + ' ' + description)) {
                quest.challengeData.flavor = 'bully';
                quest.challengeData.minionEncounter = true;
            }
        }
        // Quiz for strategy/learning quests
        else if (title.includes('học') || title.includes('chiến thuật') ||
                 title.includes('strategy') || title.includes('thuyết phục') || 
                 title.includes('chỉ điểm')) {
            quest.challengeType = 'quiz';
            quest.challengeData = generateQuizQuestions(quest);
        }
        // Timing for speed/running quests
        else if (title.includes('chạy') || title.includes('tốc độ') ||
                 title.includes('speed') || title.includes('nhanh')) {
            quest.challengeType = 'timing';
            quest.challengeData = {
                target: quest.id < 50 ? 40 : (quest.id < 200 ? 50 : 60),
                timeLimit: 10
            };
            if (/bắt nạt|kẻ bắt nạt|bully/.test(title + ' ' + description)) {
                quest.challengeData.flavor = 'bully';
            }
        }
        // Default to quiz for other non-combat quests with type 'main'
        else if (quest.type === 'main' || quest.type === 'side') {
            // default to a contextual quiz
            quest.challengeType = 'quiz';
            quest.challengeData = generateQuizQuestions(quest);
        }
    });
}

// ==================== UI FUNCTIONS ====================

// Update UI Elements
function updateUI() {
    updateCharacterPanel();
    updateQuestList();
    updateProgress();
    updateInventory();
    updateCrew();
    updateQuestTracker();
}

// Update Character Panel
function updateCharacterPanel() {
    const char = gameState.character;
    if (!char) return;
    
    // Helper to safely set text content
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    setText('characterName', char.name);
    setText('statStr', getFormattedStatTier(char.strength));
    setText('statSpd', getFormattedStatTier(char.speed));
    setText('statDur', getFormattedStatTier(char.durability));
    setText('statPot', STAT_TIERS[Math.min(char.potential, STAT_TIERS.length - 1)]);
    setText('statInt', STAT_TIERS[Math.min(char.intelligence, STAT_TIERS.length - 1)]);
    
    setText('breakthroughLevel', BREAKTHROUGH_NAMES[char.breakthrough]);
    setText('forcedBreak', char.usedForcedBreak ? 'Có' : 'Không');
    setText('exclusiveSkill', char.hasExclusiveSkill ? 'Có' : 'Chưa có');
    
    const hpPercent = (char.hp / char.maxHp) * 100;
    const hpBar = document.getElementById('hpBar');
    if (hpBar) hpBar.style.width = hpPercent + '%';
    setText('hpText', `${char.hp}/${char.maxHp}`);
}

// Update Progress Bar
function updateProgress() {
    document.getElementById('currentArc').textContent = gameState.currentArc;
    document.getElementById('questProgress').textContent = gameState.completedQuests;
    document.getElementById('totalPoints').textContent = gameState.totalPoints;
    
    // Use stored total boss quests count for progress calculation
    const totalQuests = gameState.totalBossQuests || gameState.quests.length || 500;
    const progressPercent = totalQuests > 0 ? (gameState.completedQuests / totalQuests) * 100 : 0;
    
    document.getElementById('progressFill').style.width = progressPercent + '%';
}

// Update Quest List
function filterQuests(filterType) {
    gameState.currentFilter = filterType;
    
    // Update button active state
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    updateQuestList();
}

function updateQuestList() {
    const questList = document.getElementById('questList');
    questList.innerHTML = '';
    
    const filtered = gameState.quests.filter(quest => {
        const filterMatch = gameState.currentFilter === 'all' || quest.type === gameState.currentFilter;
        return filterMatch;
    });
    
    filtered.forEach(quest => {
        const questEl = document.createElement('div');
        questEl.className = `quest-item ${quest.completed ? 'completed' : ''}`;
        
        const prerequisites = quest.prerequisites && quest.prerequisites.length > 0 
            ? gameState.quests.filter(q => quest.prerequisites.includes(q.id)).every(q => q.completed)
            : true;
        
        const isLocked = !prerequisites;
        
        questEl.innerHTML = `
            <div class="quest-header">
                <span class="quest-id">#${quest.id}</span>
                <span class="quest-name">${quest.name}</span>
                <span class="quest-type ${quest.type}">${quest.type === 'main' ? '⭐ Chính' : '◆ Phụ'}</span>
            </div>
            <div class="quest-description">${quest.description}</div>
            <div class="quest-info">
                <span>🎯 Arc ${quest.arc}</span>
                <span>💰 ${quest.points} điểm</span>
                ${quest.boss ? `<span>👹 Boss: ${quest.boss.name}</span>` : ''}
            </div>
            <button class="btn ${quest.completed ? 'btn-disabled' : isLocked ? 'btn-locked' : 'btn-success'}" 
                onclick="completeQuest(${quest.id})" 
                ${quest.completed || isLocked || gameState.gameEnded ? 'disabled' : ''}>
                ${gameState.gameEnded ? '⛔ Trò chơi kết thúc' : (quest.completed ? '✅ Hoàn thành' : isLocked ? '🔒 Chưa mở' : '▶️ Làm nhiệm vụ')}
            </button>
        `;
        
        questList.appendChild(questEl);
    });
}

// Complete Quest
function completeQuest(questId) {
    // Prevent further progress if game was ended by a story branch
    if (gameState.gameEnded) {
        alert('Trò chơi đã kết thúc.');
        return;
    }

    const quest = gameState.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return;
    
    // Check prerequisites
    if (quest.prerequisites && quest.prerequisites.length > 0) {
        const allPrereqCompleted = quest.prerequisites.every(id => 
            gameState.quests.find(q => q.id === id).completed
        );
        if (!allPrereqCompleted) {
            alert('Bạn chưa hoàn thành các nhiệm vụ tiên quyết!');
            return;
        }
    }
    
    // If quest has a boss, start boss battle
    if (quest.boss) {
        // Special handling for quest 200 based on choice from quest 199
        if (questId === 200) {
            const choice = gameState.questChoices[199];
            if (!choice) {
                alert('Bạn cần hoàn thành nhiệm vụ 199 trước!');
                return;
            }
            
            // Always fight Ryu at Quest 200 - Ryu is unbeatable
            quest.boss = { name: "Sigyeong Ryu (No.10 Phía Bắc)", stats: [100, 100, 100], isUnbeatable: true };
        }
        startBattle(questId);
        return;
    }

    // If quest has minions, start minion battle
    if (quest.minions && quest.minions.length > 0) {
        startMinionBattle(questId);
        return;
    }
    
    // ✨ NEW: If quest has challenge, start challenge
    if (quest.challengeType) {
        switch(quest.challengeType) {
            case CHALLENGE_TYPES.QTE:
                startQTEChallenge(quest);
                break;
            case CHALLENGE_TYPES.QUIZ:
                startQuizChallenge(quest);
                break;
            case CHALLENGE_TYPES.TIMING:
                startTimingChallenge(quest);
                break;
            case CHALLENGE_TYPES.PATTERN:
                // To be implemented
                alert('Pattern challenge chưa được implement!');
                completeQuestDirectly(quest);
                break;
            case CHALLENGE_TYPES.INVESTIGATION:
                // To be implemented  
                alert('Investigation challenge chưa được implement!');
                completeQuestDirectly(quest);
                break;
            default:
                completeQuestDirectly(quest);
        }
        return;
    }
    
    // Otherwise, mark as completed directly
    completeQuestDirectly(quest);
}

// Complete Quest Directly (for quests without boss)
function completeQuestDirectly(quest) {
    // Mark as completed
    quest.completed = true;
    gameState.completedQuests++;
    gameState.totalPoints += quest.points;
    
    // Auto-increase Intelligence slowly (every 25 quests) and Potential
    // Intelligence grows slowly: +1 every 25 quests (not every quest)
    if (gameState.completedQuests % STAT_CONFIG.INTELLIGENCE_QUEST_THRESHOLD === 0) {
        gameState.character.intelligence = Math.min(gameState.character.intelligence + 1, STAT_CONFIG.INTELLIGENCE_MAX);
    }
    
    // Potential grows based on quest points, capped at S (index 6)
    gameState.character.potential = Math.min(gameState.character.potential + Math.floor(quest.points / 50), STAT_CONFIG.POTENTIAL_MAX);
    
    // Process rewards
    if (quest.rewards && quest.rewards.length > 0) {
        console.log(`Processing rewards for quest ${quest.id}:`, quest.rewards);
        quest.rewards.forEach(reward => {
            processReward(reward, quest.id);
        });
        console.log('Pending stat gains now:', pendingStatGains);
        showRewardNotification(quest.rewards);
    }
    
    // If this is a boss quest, grant the quest range rewards
    if (quest.boss || quest.bosses) {
        grantBossQuestRewards(quest.id);
    }
    
    // Check for story choices
    if (quest.hasChoice) {
        showQuestChoice(quest.id);
        updateUI();  // Update UI before showing choice
        return;  // Don't continue until choice is made
    }
    
    // Check for breakthrough (which will handle stat gains after overlay)
    checkForBreakthrough(quest.id);
    
    // Update UI to reflect quest completion
    updateUI();
}

// Process Reward
function processReward(reward, questId) {
    switch (reward.type) {
        case 'stat':
            // Queue stat gains to be applied AFTER breakthrough overlay is shown
            console.log(`→ processReward: queuing stat reward ${reward.effect} from quest ${questId}`);
            pendingStatGains.push({ reward, questId });
            break;
            
        case 'skill':
            gameState.inventory.push(reward);
            break;
            
        case 'support':
            gameState.inventory.push(reward);
            break;
            
        case 'cultivation':
            // Auto-assign stat type based on card name if not already set
            if (!reward.statType) {
                if (reward.name && reward.name.includes('Sức')) {
                    reward.statType = 'strength';
                } else if (reward.name && reward.name.includes('Tốc')) {
                    reward.statType = 'speed';
                } else if (reward.name && reward.name.includes('Chịu')) {
                    reward.statType = 'durability';
                } else {
                    // Random stat if not specified
                    const statTypes = ['strength', 'speed', 'durability'];
                    reward.statType = statTypes[Math.floor(Math.random() * statTypes.length)];
                }
                // Set card level/power based on rarity if not set
                if (!reward.level) {
                    const rarityLevels = {
                        'bronze': 1,
                        'silver': 1,
                        'gold': 2,
                        'platinum': 2,
                        'diamond': 3,
                        'master': 5,
                        'challenger': 5
                    };
                    reward.level = rarityLevels[reward.rarity] || 1;
                }
            }
            gameState.inventory.push(reward);
            break;
            
        case 'special':
            gameState.inventory.push(reward);
            if (reward.effect === 'crew_member_gukja') {
                if (!gameState.crew.some(c => c.name === 'Yang Gukja')) {
                    gameState.crew.push({ name: 'Yang Gukja', stats: [0, 0, 0] });
                }
            }
            if (reward.effect === 'crew_member_hajun') {
                if (!gameState.crew.some(c => c.name === 'Gu Hajun')) {
                    gameState.crew.push({ name: 'Gu Hajun', stats: [6, 5, 6] });
                }
            }
            if (reward.effect === 'awakened_trigger') {
                // Apply breakthrough formula for Awakened
                applyBreakthroughGain(1, undefined, { questId: questId, target: 'player' });
            }
            break;
    }
}

// ==================== ADVANCED CARD SYSTEM ====================

// Use Stat Card (Thẻ chỉ số)
function useStatCard(cardIndex) {
    const card = gameState.inventory[cardIndex];
    if (!card || card.type !== 'stat') return;

    console.log('Using stat card:', card);
    
    // Show modal to choose stat
    const statOptions = ['strength', 'speed', 'durability'];
    let html = `
        <div style="text-align: center; padding: 20px;">
            <h3>${card.name}</h3>
            <p style="color: #bdc3c7; margin-bottom: 20px;">Chọn chỉ số để tăng:</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <button class="btn btn-primary" onclick="applyStat('strength', ${cardIndex})" style="width: 100%;">
                    💪 Sức Mạnh
                </button>
                <button class="btn btn-success" onclick="applyStat('speed', ${cardIndex})" style="width: 100%;">
                    ⚡ Tốc Độ
                </button>
                <button class="btn btn-info" onclick="applyStat('durability', ${cardIndex})" style="width: 100%;">
                    🛡️ Chịu Đòn
                </button>
            </div>
        </div>
    `;
    
    showCardModal('Sử Dụng Thẻ Chỉ Số', html);
}

// Use Special Card
function useSpecialCard(cardIndex) {
    const card = gameState.inventory[cardIndex];
    if (!card || card.type !== 'special') return;
    
    console.log('Using special card:', card);
    
    // Handle Card Buffet
    if (card.effect === 'card_buffet') {
        toggleShop();
        return;
    }
    
    // Handle other special cards
    let message = '';
    switch(card.effect) {
        case 'crew_member_gukja':
            message = '✅ Đã thêm Yang Gukja vào crew!';
            break;
        case 'crew_member_jihyeok':
            message = '✅ Đã thêm Jang Jihyeok vào crew!';
            break;
        case 'crew_member_hajun':
            message = '✅ Đã thêm Gu Hajun vào crew!';
            break;
        case 'awakened_trigger':
            message = '✅ Kích hoạt chuỗi Awakened!';
            break;
        default:
            message = `✨ Sử dụng: ${card.name}`;
    }
    
    showCardModal('🎉 Sử Dụng Thẻ', `<p>${message}</p>`);
}

// Apply stat increase from card
function applyStat(stat, cardIndex) {
    const card = gameState.inventory[cardIndex];
    const statCap = STAT_CONFIG.getStatCap({ target: 'player' });
    
    const effectMap = {
        'strength': { 'strength+1': 1, 'strength+2': 2, 'strength+3': 3, 'strength+5': 5 },
        'speed': { 'speed+1': 1, 'speed_debuff': 1 },
        'durability': { 'durability+1': 1, 'durability+2': 2 },
        'all_stats+1': { 'all_stats+1': 1 },
        'all_stats+2': { 'all_stats+2': 2 },
        'all_stats+3': { 'all_stats+3': 3 },
        'all_stats+4': { 'all_stats+4': 4 }
    };
    
    // helper to ensure progress array exists
    if (!gameState.character.statProgress) gameState.character.statProgress = [0,0,0];

    function applyToCharacter(statName, units) {
        const idx = statName === 'strength' ? 0 : (statName === 'speed' ? 1 : 2);
        // below SSS behave normally (each unit directly increases tier)
        if (gameState.character[statName] < 8) {
            gameState.character[statName] = Math.min(gameState.character[statName] + units, statCap);
            return { gained: true };
        }

        // at/above SSS require accumulating cards
        let gained = false;
        let remainingUnits = units;
        while (remainingUnits > 0 && gameState.character[statName] < statCap) {
            const required = cardsRequiredForFromIndex(gameState.character[statName]);
            gameState.character.statProgress[idx] = (gameState.character.statProgress[idx] || 0) + 1; // each unit counts as 1 card-unit
            remainingUnits -= 1;
            if (gameState.character.statProgress[idx] >= required) {
                gameState.character[statName] = Math.min(gameState.character[statName] + 1, statCap);
                gameState.character.statProgress[idx] -= required;
                gained = true;
            }
        }
        return { gained };
    }

    // Determine units to apply
    const effect = card.effect || '';
    // Handle all-stats card effects separately
    let unitsApplied = 0;
    if (effect.startsWith('all_stats')) {
        const parts = effect.split('+');
        const units = parseInt(parts[1]) || 1;
        // apply units to each stat
        applyToCharacter('strength', units);
        applyToCharacter('speed', units);
        applyToCharacter('durability', units);
        unitsApplied = units; // for message
    } else {
        // parse numeric from effect like 'strength+2' or map fallback
        const match = effect.match(/\+(\d+)/);
        const units = match ? parseInt(match[1]) : (effect.includes('debuff') ? 1 : 1);
        applyToCharacter(stat, units);
        unitsApplied = units;
    }

    // Remove card
    gameState.inventory.splice(cardIndex, 1);

    alert(`✅ Đã sử dụng ${unitsApplied} thẻ cho ${stat}.`);
    closeModal();
    updateUI();
}

// Helper: Get potential multiplier from potential index
function getPotentialMultiplier(potentialIndex) {
    // potentialIndex corresponds to STAT_TIERS index (S = 6, A = 5, B = 4, C = 3)
    if (typeof potentialIndex !== 'number') potentialIndex = gameState.character.potential || 0;
    if (potentialIndex >= 6) return 2.0;      // S or higher
    if (potentialIndex === 5) return 1.5;     // A
    if (potentialIndex === 4) return 1.2;     // B
    if (potentialIndex === 3) return 1.0;     // C
    return 0.8;                               // below C
}

// Apply red styling to unmeasurable stats in battle display
function applyStatStyling(elementId, statIndex) {
    try {
        if (!elementId || typeof statIndex !== 'number') return;
        const element = document.getElementById(elementId);
        if (!element) return;
        
        if (statIndex > 18) {
            element.style.color = '#e74c3c';
            element.style.fontWeight = 'bold';
            element.style.textShadow = '0 0 10px rgba(231, 76, 60, 0.8)';
        }
    } catch (e) {
        // Silently catch styling errors
    }
}

// Helper: Apply card-units to a character stat (reuses same rules as stat cards)
function applyStatUnitsToCharacter(statName, units, context = {}) {
    const statCap = STAT_CONFIG.getStatCap(context);
    if (!gameState.character.statProgress) gameState.character.statProgress = [0, 0, 0];
    const idx = statName === 'strength' ? 0 : (statName === 'speed' ? 1 : 2);

    // Below SSS behave normally (each unit goes directly to tier)
    if (gameState.character[statName] < 8) {
        const add = Math.min(units, Math.max(0, statCap - gameState.character[statName]));
        gameState.character[statName] = Math.min(gameState.character[statName] + add, statCap);
        units -= add;
    }

    // At/above SSS or remaining units require accumulating card-units
    while (units > 0 && gameState.character[statName] < statCap) {
        const required = cardsRequiredForFromIndex(gameState.character[statName]);
        gameState.character.statProgress[idx] = (gameState.character.statProgress[idx] || 0) + 1;
        units -= 1;
        if (gameState.character.statProgress[idx] >= required) {
            gameState.character[statName] = Math.min(gameState.character[statName] + 1, statCap);
            gameState.character.statProgress[idx] -= required;
        }
    }
}

// Apply breakthrough stat gains using the formula: TotalUnits = G * PotentialMultiplier(P)
// G mapping: Awakened(1) => 2, Ascendant(2) => 3, Transcendent(3) => 5 (default)
function applyBreakthroughGain(breakthroughLevel, gradeGainOverride, context = {}) {
    if (!gameState.character) return;
    gameState.character.breakthroughApplied = gameState.character.breakthroughApplied || {};
    if (gameState.character.breakthroughApplied[breakthroughLevel]) return; // don't apply twice

    const Gmap = { 1: 2, 2: 3, 3: 5 };
    const G = (typeof gradeGainOverride === 'number') ? gradeGainOverride : (Gmap[breakthroughLevel] || 2);
    const multiplier = getPotentialMultiplier(gameState.character.potential);
    const totalUnits = Math.round(G * multiplier);

    // Apply to each primary combat stat
    applyStatUnitsToCharacter('strength', totalUnits, context);
    applyStatUnitsToCharacter('speed', totalUnits, context);
    applyStatUnitsToCharacter('durability', totalUnits, context);

    gameState.character.breakthroughApplied[breakthroughLevel] = true;

    addBattleLog(`✨ Breakthrough applied: level ${breakthroughLevel} → ${totalUnits} units per stat (G=${G}, Mult=${multiplier})`);
    updateUI();
}

// Apply pending stat gains from rewards (called AFTER breakthrough overlay completes)
function applyRewardStatGains() {
    if (pendingStatGains.length === 0) {
        // No pending gains, but still update UI
        updateUI();
        return;
    }
    
    console.log('Applying pending stat gains:', pendingStatGains);
    
    pendingStatGains.forEach(({ reward, questId }) => {
        const statCap = STAT_CONFIG.getStatCap({ questId: questId, target: 'player' });
        
        const statMap = {
            'strength+1': () => gameState.character.strength = Math.min(gameState.character.strength + 1, statCap),
            'strength+2': () => gameState.character.strength = Math.min(gameState.character.strength + 2, statCap),
            'strength+3': () => gameState.character.strength = Math.min(gameState.character.strength + 3, statCap),
            'strength+5': () => gameState.character.strength = Math.min(gameState.character.strength + 5, statCap),
            'speed+1': () => gameState.character.speed = Math.min(gameState.character.speed + 1, statCap),
            'speed_debuff': () => gameState.character.speed = Math.min(gameState.character.speed + 1, statCap),
            'durability+1': () => gameState.character.durability = Math.min(gameState.character.durability + 1, statCap),
            'durability+2': () => gameState.character.durability = Math.min(gameState.character.durability + 2, statCap),
            'potential+1': () => gameState.character.potential = Math.min(gameState.character.potential + 1, STAT_CONFIG.POTENTIAL_MAX),
            'potential_max': () => gameState.character.potential = STAT_CONFIG.POTENTIAL_MAX,
            'intelligence+2': () => gameState.character.intelligence = Math.min(gameState.character.intelligence + 2, STAT_CONFIG.INTELLIGENCE_MAX),
            'random_stat+1': () => {
                const stats = ['strength', 'speed', 'durability'];
                const randomStat = stats[Math.floor(Math.random() * stats.length)];
                gameState.character[randomStat] = Math.min(gameState.character[randomStat] + 1, statCap);
            },
            'random_stat+2': () => {
                const stats = ['strength', 'speed', 'durability'];
                const randomStat = stats[Math.floor(Math.random() * stats.length)];
                gameState.character[randomStat] = Math.min(gameState.character[randomStat] + 2, statCap);
            },
            'all_stats+1': () => {
                gameState.character.strength = Math.min(gameState.character.strength + 1, statCap);
                gameState.character.speed = Math.min(gameState.character.speed + 1, statCap);
                gameState.character.durability = Math.min(gameState.character.durability + 1, statCap);
            },
            'all_stats+2': () => {
                gameState.character.strength = Math.min(gameState.character.strength + 2, statCap);
                gameState.character.speed = Math.min(gameState.character.speed + 2, statCap);
                gameState.character.durability = Math.min(gameState.character.durability + 2, statCap);
            },
            'all_stats+3': () => {
                gameState.character.strength = Math.min(gameState.character.strength + 3, statCap);
                gameState.character.speed = Math.min(gameState.character.speed + 3, statCap);
                gameState.character.durability = Math.min(gameState.character.durability + 3, statCap);
            },
            'all_stats+4': () => {
                gameState.character.strength = Math.min(gameState.character.strength + 4, statCap);
                gameState.character.speed = Math.min(gameState.character.speed + 4, statCap);
                gameState.character.durability = Math.min(gameState.character.durability + 4, statCap);
            },
            'all_combat_stats+3': () => {
                gameState.character.strength = Math.min(gameState.character.strength + 3, statCap);
                gameState.character.speed = Math.min(gameState.character.speed + 3, statCap);
                gameState.character.durability = Math.min(gameState.character.durability + 3, statCap);
            }
        };
        if (statMap[reward.effect]) statMap[reward.effect]();
    });
    
    pendingStatGains = [];
    console.log('Character stats (final) after applying rewards:', {
        strength: gameState.character.strength,
        speed: gameState.character.speed,
        durability: gameState.character.durability,
        potential: gameState.character.potential
    });
    updateUI();
}

// Use Cultivation Card (Thẻ bồi dưỡng)
function useCultivationCard(cardIndex) {
    const card = gameState.inventory[cardIndex];
    if (!card || card.type !== 'cultivation') return;

    console.log('Using cultivation card:', card);
    
    // Show crew member selection
    if (gameState.crew.length === 0) {
        alert('Bạn chưa có thành viên crew!');
        return;
    }
    
    // Determine stat type from card name
    let stat = 'strength';
    if (card.statType === 'speed') stat = 'speed';
    else if (card.statType === 'durability') stat = 'durability';
    
    let html = `
        <div style="padding: 20px;">
            <h3>${card.name}</h3>
            <p style="color: #bdc3c7; margin-bottom: 20px;">Chọn thành viên để tăng chỉ số:</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
    `;
    
    gameState.crew.forEach((member, idx) => {
        html += `
            <div style="border: 2px solid #3498db; border-radius: 8px; padding: 15px; cursor: pointer;" 
                 onclick="applyCultivationToMember(${idx}, ${cardIndex}, '${stat}')">
                <strong>${member.name}</strong><br>
                <small>💪 ${getFormattedStatTier(member.stats[0])} 
                        ⚡ ${getFormattedStatTier(member.stats[1])} 
                        🛡️ ${getFormattedStatTier(member.stats[2])}</small>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    showCardModal('Sử Dụng Thẻ Bồi Dưỡng', html);
}

// Apply cultivation card directly to member (new function)
function applyCultivationToMember(memberIndex, cardIndex, stat) {
    const card = gameState.inventory[cardIndex];
    const statIndex = stat === 'strength' ? 0 : (stat === 'speed' ? 1 : 2);
    const statCap = STAT_CONFIG.getStatCap({ target: 'crew' });
    
    // Determine increase amount based on card level
    // Determine increase amount based on card level (treat as card-units)
    let units = 1;
    if (card.level === 2) units = 2;
    else if (card.level === 3) units = 3;
    else if (card.level === 5) units = 5;

    // ensure member progress array exists
    if (!gameState.crew[memberIndex].statProgress) gameState.crew[memberIndex].statProgress = [0,0,0];

    // helper to apply units
    function applyToMember(idxUnits) {
        // below SSS behave normally
        if (gameState.crew[memberIndex].stats[statIndex] < 8) {
            gameState.crew[memberIndex].stats[statIndex] = Math.min(
                gameState.crew[memberIndex].stats[statIndex] + idxUnits,
                statCap
            );
            return true;
        }

        let gained = false;
        let remaining = idxUnits;
        while (remaining > 0 && gameState.crew[memberIndex].stats[statIndex] < statCap) {
            const required = cardsRequiredForFromIndex(gameState.crew[memberIndex].stats[statIndex]);
            gameState.crew[memberIndex].statProgress[statIndex] = (gameState.crew[memberIndex].statProgress[statIndex] || 0) + 1;
            remaining -= 1;
            if (gameState.crew[memberIndex].statProgress[statIndex] >= required) {
                gameState.crew[memberIndex].stats[statIndex] = Math.min(gameState.crew[memberIndex].stats[statIndex] + 1, statCap);
                gameState.crew[memberIndex].statProgress[statIndex] -= required;
                gained = true;
            }
        }
        return gained;
    }

    // If already at max
    if (gameState.crew[memberIndex].stats[statIndex] >= statCap) {
        alert('⚠️ Chỉ số hiện đã đạt tối đa, vui lòng hoàn thành Quest để mở khóa chỉ số cao hơn');
        closeModal();
        return;
    }

    applyToMember(units);

    // Remove card
    gameState.inventory.splice(cardIndex, 1);

    alert(`✅ ${gameState.crew[memberIndex].name} nhận ${units} đơn vị bồi dưỡng cho ${stat}.`);

    closeModal();
    updateUI();
}

// Select crew member and then stat (legacy function - kept for compatibility)
function selectCrewMember(memberIndex, cardIndex) {
    const card = gameState.inventory[cardIndex];
    
    let html = `
        <div style="text-align: center; padding: 20px;">
            <h3>${gameState.crew[memberIndex].name}</h3>
            <p style="color: #bdc3c7; margin-bottom: 20px;">Chọn chỉ số để tăng:</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <button class="btn btn-primary" onclick="applyCrewStat(${memberIndex}, 'strength', ${cardIndex})" style="width: 100%;">
                    💪 Sức Mạnh
                </button>
                <button class="btn btn-success" onclick="applyCrewStat(${memberIndex}, 'speed', ${cardIndex})" style="width: 100%;">
                    ⚡ Tốc Độ
                </button>
                <button class="btn btn-info" onclick="applyCrewStat(${memberIndex}, 'durability', ${cardIndex})" style="width: 100%;">
                    🛡️ Chịu Đòn
                </button>
            </div>
        </div>
    `;
    
    showCardModal('Chọn Chỉ Số', html);
}

// Apply stat to crew member
function applyCrewStat(memberIndex, stat, cardIndex) {
    const card = gameState.inventory[cardIndex];
    const effectMap = {
        'strength': { 'strength+1': 1, 'strength+2': 2, 'strength+3': 3, 'strength+5': 5 },
        'speed': { 'speed+1': 1, 'speed_debuff': 1 },
        'durability': { 'durability+1': 1, 'durability+2': 2 }
    };
    
    const statIndex = stat === 'strength' ? 0 : (stat === 'speed' ? 1 : 2);
    const units = effectMap[stat]?.[card.effect] || 1;
    const statCap = STAT_CONFIG.getStatCap({ target: 'crew' });

    // ensure progress exists
    if (!gameState.crew[memberIndex].statProgress) gameState.crew[memberIndex].statProgress = [0,0,0];

    // If below SSS simply add units
    if (gameState.crew[memberIndex].stats[statIndex] < 8) {
        gameState.crew[memberIndex].stats[statIndex] = Math.min(
            gameState.crew[memberIndex].stats[statIndex] + units,
            statCap
        );
    } else {
        // accumulate units towards next tier
        let remaining = units;
        while (remaining > 0 && gameState.crew[memberIndex].stats[statIndex] < statCap) {
            const required = cardsRequiredForFromIndex(gameState.crew[memberIndex].stats[statIndex]);
            gameState.crew[memberIndex].statProgress[statIndex] = (gameState.crew[memberIndex].statProgress[statIndex] || 0) + 1;
            remaining -= 1;
            if (gameState.crew[memberIndex].statProgress[statIndex] >= required) {
                gameState.crew[memberIndex].stats[statIndex] = Math.min(gameState.crew[memberIndex].stats[statIndex] + 1, statCap);
                gameState.crew[memberIndex].statProgress[statIndex] -= required;
            }
        }
    }

    // Remove card
    gameState.inventory.splice(cardIndex, 1);

    alert(`✅ ${gameState.crew[memberIndex].name} nhận ${units} đơn vị cho ${stat}.`);
    closeModal();
    updateUI();
}

// Show Card Modal
function showCardModal(title, html) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add('active');
}

// Close Modal
function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// Show Quest Choice (for story-branching quests)
function showQuestChoice(questId) {
    let html = '';
    
    if (questId === 199) {
        html = `
            <div style="text-align: center; padding: 20px;">
                <p style="font-size: 1.1em; line-height: 1.8; margin-bottom: 20px;">
                    Han Jaeha đang bị lâm nguy. Sigyeong Ryu đã phản bội anh ta và lộ thân phận là No.10 Phía Bắc.
                    <br><br>
                    <strong>Bạn sẽ chọn giúp ai?</strong>
                </p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                    <button class="btn btn-primary" onclick="makeQuestChoice(199, 'jaeha')" style="padding: 15px; font-size: 1.1em;">
                        💙 Han Jaeha (Quân sư)<br><small>Nhận: Thẻ Master</small>
                    </button>
                    <button class="btn btn-success" onclick="makeQuestChoice(199, 'ryu')" style="padding: 15px; font-size: 1.1em;">
                        💚 Sigyeong Ryu<br><small>Nhận: Thẻ Kim cương</small>
                    </button>
                </div>
            </div>
        `;
    }
    
    showCardModal('🎯 Lựa Chọn Quan Trọng', html);
}

// Make Quest Choice
function makeQuestChoice(questId, choice) {
    gameState.questChoices[questId] = choice;
    closeModal();
    
    if (questId === 199) {
        if (choice === 'jaeha') {
            // Add Master card reward
            gameState.inventory.push({ type: 'special', name: 'Han Jaeha', rarity: 'master', effect: 'choice_jaeha_master' });
            showRewardNotification([{ type: 'special', name: 'Thẻ Master', rarity: 'master', effect: 'choice_jaeha_master' }]);
        } else {
            // Choosing Ryu ends the game immediately (Ryu ending)
            endGame('Bạn đã chọn giúp Ryu, đồng nghĩa với việc bạn đã về dưới trướng phía Bắc, trò chơi kết thúc');
            return;
        }
    }
    
    checkForBreakthrough(questId);
    updateUI();
}

// ==================== END ADVANCED CARD SYSTEM ====================

function checkForBreakthrough(questId) {
    // Quest 180: First Awakened
    if (questId === 180) {
        gameState.character.breakthrough = 1;
        showBreakthroughOverlay('⚡ THỨC TỈNH ⚡', 'AWAKENED', () => {
            applyBreakthroughGain(1, undefined, { questId: questId });
            applyRewardStatGains();
        });
    }
    // Quest 300: Transcendent Candidate
    else if (questId === 300) {
        // Diagnostic log for Quest 300 to help debug missing stat increases
        console.log('--- Quest 300 breakthrough check ---');
        console.log('Pending stat gains before overlay:', pendingStatGains);
        console.log('Character stats before overlay:', {
            str: gameState.character.strength,
            spd: gameState.character.speed,
            dur: gameState.character.durability,
            potential: gameState.character.potential,
            breakthrough: gameState.character.breakthrough
        });
        showBreakthroughOverlay('💫 ĐỦ ĐIỀU KIỆN PHÁT TRIỂN', null, () => {
            applyRewardStatGains();
            console.log('Character stats after applying pending gains:', {
                str: gameState.character.strength,
                spd: gameState.character.speed,
                dur: gameState.character.durability,
                potential: gameState.character.potential,
                breakthrough: gameState.character.breakthrough
            });
        });
    }
    // Quest 351: Ascendant
    else if (questId === 351) {
        gameState.character.breakthrough = 2;
        showBreakthroughOverlay('✨ SIÊU VIỆT ✨', 'ASCENDANT', () => {
            applyBreakthroughGain(2, undefined, { questId: questId });
            applyRewardStatGains();
        });
    }
    // Quest 498: Transcendent
    else if (questId === 498) {
        gameState.character.breakthrough = 3;
        showBreakthroughOverlay('🌟 MỞ RA CON ĐƯỜNG GIÁC NGỘ 🌟', 'TRANSCENDENT', () => {
            applyBreakthroughGain(3, undefined, { questId: questId });
            applyRewardStatGains();
        });
    } else {
        // No breakthrough - apply pending stat gains immediately
        applyRewardStatGains();
    }
}

// Show Breakthrough Overlay with optional callback after display time
function showBreakthroughOverlay(title, subtitle, callback) {
    const overlay = document.getElementById('breakthroughOverlay');
    document.querySelector('.breakthrough-text').textContent = title;
    if (subtitle) {
        document.getElementById('breakthroughType').textContent = subtitle;
    }
    overlay.classList.add('active');
    
    // Call callback after display time complete
    setTimeout(() => {
        overlay.classList.remove('active');
        if (typeof callback === 'function') {
            callback();
        }
    }, BATTLE_TIMING.BREAKTHROUGH_DISPLAY_TIME);
}

// Show Reward Notification
function showRewardNotification(rewards) {
    let rewardText = rewards.map(r => `${r.name} (${r.rarity})`).join('\n');
    alert(`🎉 Phần thưởng:\n${rewardText}`);
}

// End the game due to story choice (Ryu ending)
function endGame(message) {
    gameState.gameEnded = true;
    const html = `
        <div style="text-align:center; padding:20px;">
            <p style="font-size:1.1em; margin-bottom:20px;">${message}</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="btn btn-success" onclick="location.reload()">🔁 Khởi động lại</button>
                <button class="btn btn-danger" onclick="closeModal()">Đóng</button>
            </div>
        </div>
    `;
    showCardModal('Kết thúc trò chơi', html);
    updateUI();
}

// Update Inventory
function filterInventory() {
    updateInventory();
}

function updateInventory() {
    const inventoryList = document.getElementById('inventoryList');
    const cardCount = document.getElementById('cardCount');
    const typeFilter = document.getElementById('cardTypeFilter') ? document.getElementById('cardTypeFilter').value : 'all';
    
    cardCount.textContent = gameState.inventory.length;
    inventoryList.innerHTML = '';
    
    const filtered = gameState.inventory.filter(card => 
        typeFilter === 'all' || card.type === typeFilter
    );
    
    // For cultivation cards, group by stat type
    const cultivationCards = filtered.filter(c => c.type === 'cultivation');
    const otherCards = filtered.filter(c => c.type !== 'cultivation');
    
    // If showing cultivation cards, group them by stat type
    if (typeFilter === 'all' || typeFilter === 'cultivation') {
        const statGroups = {
            'strength': [],
            'speed': [],
            'durability': [],
            'other': []
        };
        
        cultivationCards.forEach((card, idx) => {
            if (card.statType === 'strength') {
                statGroups['strength'].push(card);
            } else if (card.statType === 'speed') {
                statGroups['speed'].push(card);
            } else if (card.statType === 'durability') {
                statGroups['durability'].push(card);
            } else {
                statGroups['other'].push(card);
            }
        });
        
        // Display grouped cultivation cards
        const statTypeInfo = {
            'strength': { label: '💪 Sức Mạnh', color: '#e74c3c' },
            'speed': { label: '⚡ Tốc Độ', color: '#f39c12' },
            'durability': { label: '🛡️ Chịu Đòn', color: '#3498db' },
            'other': { label: '❓ Khác', color: '#95a5a6' }
        };
        
        Object.entries(statGroups).forEach(([statType, cards]) => {
            if (cards.length > 0) {
                // Add group header
                const headerEl = document.createElement('div');
                headerEl.style.cssText = 'width: 100%; padding: 10px; background: rgba(' + parseInt(statTypeInfo[statType].color.slice(1,3), 16) + ',' + parseInt(statTypeInfo[statType].color.slice(3,5), 16) + ',' + parseInt(statTypeInfo[statType].color.slice(5,7), 16) + ',0.2); border-bottom: 3px solid ' + statTypeInfo[statType].color + '; margin-top: 10px; font-weight: bold; color: ' + statTypeInfo[statType].color + ';';
                headerEl.textContent = statTypeInfo[statType].label;
                inventoryList.appendChild(headerEl);
                
                // Group cultivation cards by name and rarity
                const groupedCards = {};
                cards.forEach(card => {
                    const key = `${card.name}_${card.rarity}`;
                    if (!groupedCards[key]) {
                        groupedCards[key] = { card: card, count: 0, indices: [] };
                    }
                    groupedCards[key].count++;
                    groupedCards[key].indices.push(gameState.inventory.indexOf(card));
                });
                
                // Add grouped cards
                Object.values(groupedCards).forEach(group => {
                    const cardEl = document.createElement('div');
                    cardEl.className = `card-item rarity-${group.card.rarity}`;
                    cardEl.style.position = 'relative';
                    cardEl.onclick = function() { useCultivationCard(group.indices[0]); };
                    cardEl.style.cursor = 'pointer';
                    cardEl.style.transition = 'all 0.3s';
                    cardEl.onmouseover = function() { this.style.transform = 'scale(1.05)'; this.style.boxShadow = '0 0 20px rgba(52, 152, 219, 0.8)'; };
                    cardEl.onmouseout = function() { this.style.transform = 'scale(1)'; this.style.boxShadow = ''; };
                    
                    let quantityBadge = '';
                    if (group.count > 1) {
                        quantityBadge = `<div style="position: absolute; top: 5px; right: 5px; background: #e74c3c; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.75em; font-weight: bold;">x${group.count}</div>`;
                    }
                    
                    cardEl.innerHTML = `
                        ${quantityBadge}
                        <div class="card-name">${group.card.name}</div>
                        <div class="card-type">🌟 Bồi Dưỡng ${statTypeInfo[statType].label}</div>
                        <div class="card-effect">${group.card.effect}</div>
                    `;
                    
                    inventoryList.appendChild(cardEl);
                });
            }
        });
    }
    
    // Group other card types by name and rarity
    const groupedOtherCards = {};
    otherCards.forEach((card) => {
        const key = `${card.name}_${card.rarity}`;
        if (!groupedOtherCards[key]) {
            groupedOtherCards[key] = { card: card, count: 0, indices: [] };
        }
        groupedOtherCards[key].count++;
        groupedOtherCards[key].indices.push(gameState.inventory.indexOf(card));
    });
    
    // Display grouped other card types
    Object.values(groupedOtherCards).forEach((group) => {
        const cardEl = document.createElement('div');
        cardEl.className = `card-item rarity-${group.card.rarity}`;
        cardEl.style.position = 'relative';
        
        // Add onclick handler based on card type
        if (group.card.type === 'stat') {
            cardEl.onclick = function() { useStatCard(group.indices[0]); };
            cardEl.style.cursor = 'pointer';
            cardEl.style.transition = 'all 0.3s';
            cardEl.onmouseover = function() { this.style.transform = 'scale(1.05)'; this.style.boxShadow = '0 0 20px rgba(52, 152, 219, 0.8)'; };
            cardEl.onmouseout = function() { this.style.transform = 'scale(1)'; this.style.boxShadow = ''; };
        } else if (group.card.type === 'special') {
            cardEl.onclick = function() { useSpecialCard(group.indices[0]); };
            cardEl.style.cursor = 'pointer';
            cardEl.style.transition = 'all 0.3s';
            cardEl.onmouseover = function() { this.style.transform = 'scale(1.05)'; this.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.8)'; };
            cardEl.onmouseout = function() { this.style.transform = 'scale(1)'; this.style.boxShadow = ''; };
        } else if (group.card.type === 'support') {
            cardEl.style.cursor = 'pointer';
            cardEl.style.transition = 'all 0.3s';
            cardEl.onmouseover = function() { this.style.transform = 'scale(1.05)'; this.style.boxShadow = '0 0 20px rgba(52, 152, 219, 0.8)'; };
            cardEl.onmouseout = function() { this.style.transform = 'scale(1)'; this.style.boxShadow = ''; };
        } else if (group.card.type === 'skill') {
            cardEl.style.cursor = 'pointer';
            cardEl.style.transition = 'all 0.3s';
            cardEl.onmouseover = function() { this.style.transform = 'scale(1.05)'; this.style.boxShadow = '0 0 20px rgba(52, 152, 219, 0.8)'; };
            cardEl.onmouseout = function() { this.style.transform = 'scale(1)'; this.style.boxShadow = ''; };
        }
        
        let quantityBadge = '';
        if (group.count > 1) {
            quantityBadge = `<div style="position: absolute; top: 5px; right: 5px; background: #e74c3c; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.75em; font-weight: bold;">x${group.count}</div>`;
        }
        
        cardEl.innerHTML = `
            ${quantityBadge}
            <div class="card-name">${group.card.name}</div>
            <div class="card-type">${group.card.type === 'stat' ? '📊 Chỉ Số' : group.card.type === 'skill' ? '⚔️ Kỹ Năng' : group.card.type === 'support' ? '🛡️ Hỗ Trợ' : group.card.type === 'special' ? '✨ Đặc Biệt' : group.card.type}</div>
            <div class="card-effect">${group.card.effect}</div>
        `;
        
        inventoryList.appendChild(cardEl);
    });
}

// Update Crew
function updateCrew() {
    const crewList = document.getElementById('crewList');
    const crewCount = document.getElementById('crewCount');
    
    crewCount.textContent = gameState.crew.length;
    crewList.innerHTML = '';
    
    gameState.crew.forEach(member => {
        const crewEl = document.createElement('div');
        crewEl.className = 'crew-member';
        crewEl.innerHTML = `
            <div class="crew-name">${member.name}</div>
            <div class="crew-stats">
                <span>💪 ${getFormattedStatTier(member.stats[0])}</span>
                <span>⚡ ${getFormattedStatTier(member.stats[1])}</span>
                <span>🛡️ ${getFormattedStatTier(member.stats[2])}</span>
            </div>
        `;
        crewList.appendChild(crewEl);
    });
}

// Update Quest Tracker (Show available quests)
function updateQuestTracker() {
    const tracker = document.getElementById('questTrackerList');
    tracker.innerHTML = '';
    
    const availableQuests = gameState.quests.filter(quest => {
        if (quest.completed) return false;
        
        const prerequisites = quest.prerequisites && quest.prerequisites.length > 0 
            ? gameState.quests.filter(q => quest.prerequisites.includes(q.id)).every(q => q.completed)
            : true;
        
        return prerequisites;
    }).slice(0, 5); // Show only top 5 available quests
    
    availableQuests.forEach(quest => {
        const trackerEl = document.createElement('div');
        trackerEl.className = 'tracker-item';
        trackerEl.innerHTML = `
            <span>#${quest.id}: ${quest.name}</span>
            <span class="tracker-type">${quest.type === 'main' ? '⭐' : '◆'}</span>
        `;
        trackerEl.onclick = () => {
            document.querySelector(`[onclick="completeQuest(${quest.id})"]`)?.scrollIntoView({ behavior: 'smooth' });
        };
        tracker.appendChild(trackerEl);
    });
}

// ==================== BATTLE SYSTEM (TURN-BASED) ====================

// ========== SHOP SYSTEM ==========
// Shop inventory with all available cards
const SHOP_INVENTORY = [
    // Stat Cards - Bronze
    { type: 'stat', name: 'Thẻ Sức mạnh Bronze', rarity: 'bronze', effect: 'strength+1', price: 50 },
    { type: 'stat', name: 'Thẻ Tốc độ Bronze', rarity: 'bronze', effect: 'speed+1', price: 50 },
    { type: 'stat', name: 'Thẻ Chịu đòn Bronze', rarity: 'bronze', effect: 'durability+1', price: 50 },
    
    // Stat Cards - Silver
    { type: 'stat', name: 'Thẻ Sức mạnh Silver', rarity: 'silver', effect: 'strength+2', price: 100 },
    { type: 'stat', name: 'Thẻ Tốc độ Silver', rarity: 'silver', effect: 'speed+2', price: 100 },
    { type: 'stat', name: 'Thẻ Chịu đòn Silver', rarity: 'silver', effect: 'durability+2', price: 100 },
    { type: 'stat', name: 'Thẻ Stat Silver', rarity: 'silver', effect: 'random_stat+1', price: 120 },
    
    // Stat Cards - Gold
    { type: 'stat', name: 'Thẻ Sức mạnh Gold', rarity: 'gold', effect: 'strength+3', price: 200 },
    { type: 'stat', name: 'Thẻ Tốc độ Gold', rarity: 'gold', effect: 'speed+3', price: 200 },
    { type: 'stat', name: 'Thẻ Chịu đòn Gold', rarity: 'gold', effect: 'durability+3', price: 200 },
    { type: 'stat', name: 'Thẻ Stat Gold', rarity: 'gold', effect: 'random_stat+2', price: 300 },
    
    // Stat Cards - Platinum
    { type: 'stat', name: 'Thẻ Sức mạnh Bạch kim', rarity: 'platinum', effect: 'strength+4', price: 500 },
    { type: 'stat', name: 'Thẻ Tốc độ Bạch kim', rarity: 'platinum', effect: 'speed+4', price: 500 },
    { type: 'stat', name: 'Thẻ Chịu đòn Bạch kim', rarity: 'platinum', effect: 'durability+4', price: 500 },
    { type: 'stat', name: 'Thẻ Stat Bạch kim', rarity: 'platinum', effect: 'all_stats+3', price: 800 },
    
    // Stat Cards - Diamond
    { type: 'stat', name: 'Thẻ Sức mạnh Diamond', rarity: 'diamond', effect: 'strength+5', price: 1000 },
    { type: 'stat', name: 'Thẻ Tốc độ Diamond', rarity: 'diamond', effect: 'speed+5', price: 1000 },
    { type: 'stat', name: 'Thẻ Chịu đòn Diamond', rarity: 'diamond', effect: 'durability+5', price: 1000 },
    { type: 'stat', name: 'Thẻ Stat Diamond', rarity: 'diamond', effect: 'all_stats+4', price: 1500 },
    
    // Skill Cards
    { type: 'skill', name: 'Overhand', rarity: 'bronze', effect: 'damage+15', price: 75 },
    { type: 'skill', name: 'Cross Hook', rarity: 'silver', effect: 'damage+30', price: 150 },
    { type: 'skill', name: 'Uppercut', rarity: 'gold', effect: 'damage+50', price: 300 },
    { type: 'skill', name: 'Iron Fist', rarity: 'silver', effect: 'damage+90', price: 150 },
    { type: 'skill', name: 'Megaton Impact', rarity: 'master', effect: 'damage+150', price: 1500 },
    
    // Support Cards
    { type: 'support', name: 'Healing Rice', rarity: 'silver', effect: 'heal+30%', price: 150 },
    { type: 'support', name: 'Senzu Bean', rarity: 'gold', effect: 'full_heal', price: 300 },
    { type: 'support', name: 'Full heal', rarity: 'platinum', effect: 'full_heal', price: 800 },
    { type: 'support', name: 'Guard Fist', rarity: 'bronze', effect: 'shield+10%', price: 80 },
    { type: 'support', name: 'Iron Bulwark', rarity: 'silver', effect: 'shield+30%', price: 150 },
    { type: 'support', name: 'Indomitable Spirit', rarity: 'gold', effect: 'shield+50%', price: 300 },
    
    // Cultivation Cards
    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Bronze', rarity: 'bronze', effect: 'crew_boost', price: 100 },
    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Silver', rarity: 'silver', effect: 'crew_boost', price: 200 },
    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Gold', rarity: 'gold', effect: 'crew_boost_gold', price: 400 },
    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Platinum', rarity: 'platinum', effect: 'crew_boost_plat', price: 800 },
    { type: 'cultivation', name: 'Thẻ Bồi dưỡng Diamond', rarity: 'diamond', effect: 'crew_boost', price: 1500 },
];

function toggleShop() {
    const hasCardBuffet = gameState.inventory.some(card => card.effect === 'card_buffet');
    if (!hasCardBuffet) {
        showCardModal('❌ Chưa mở khoá', '<p>Bạn cần thẻ <strong>Card Buffet</strong> để truy cập cửa hàng!</p>');
        return;
    }
    
    const shopPanel = document.getElementById('shopPanel');
    const inventoryPanel = document.getElementById('inventoryPanel');
    
    if (shopPanel.style.display === 'none') {
        shopPanel.style.display = 'block';
        inventoryPanel.style.display = 'none';
        updateShop();
    } else {
        shopPanel.style.display = 'none';
        inventoryPanel.style.display = 'block';
        updateInventory();
    }
}

function updateShop() {
    const shopList = document.getElementById('shopList');
    const typeFilter = document.getElementById('shopTypeFilter') ? document.getElementById('shopTypeFilter').value : 'all';
    
    shopList.innerHTML = '';
    
    const filtered = SHOP_INVENTORY.filter(card =>
        typeFilter === 'all' || card.type === typeFilter
    );
    
    // Group by rarity
    const rarityOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const grouped = {};
    
    rarityOrder.forEach(rarity => {
        grouped[rarity] = filtered.filter(c => c.rarity === rarity);
    });
    
    Object.entries(grouped).forEach(([rarity, cards]) => {
        if (cards.length === 0) return;
        
        const rarityLabel = {
            'bronze': '🥉 Bronze',
            'silver': '🥈 Silver',
            'gold': '🥇 Gold',
            'platinum': '💎 Platinum',
            'diamond': '💠 Diamond'
        }[rarity];
        
        const rarityDiv = document.createElement('div');
        rarityDiv.className = 'rarity-group';
        rarityDiv.innerHTML = `<strong style="display: block; padding: 10px 0; color: #3498db;">${rarityLabel}</strong>`;
        
        cards.forEach((card, idx) => {
            const cardDiv = document.createElement('div');
            cardDiv.className = `card-item ${rarity}`;
            cardDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div class="card-name">${card.name}</div>
                        <div class="card-type">${card.type}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: #f39c12; font-weight: bold; margin-bottom: 5px;">💰 ${card.price}</div>
                        <button class="btn btn-success" style="padding: 5px 10px; font-size: 0.9em;" onclick="buyCard(${SHOP_INVENTORY.indexOf(card)})">Mua</button>
                    </div>
                </div>
            `;
            rarityDiv.appendChild(cardDiv);
        });
        
        shopList.appendChild(rarityDiv);
    });
}

function filterShop() {
    updateShop();
}

function buyCard(shopIndex) {
    const card = SHOP_INVENTORY[shopIndex];
    if (!card) return;
    
    if (gameState.points < card.price) {
        alert(`⛔ Không đủ điểm! Cần ${card.price} điểm, bạn có ${gameState.points} điểm.`);
        return;
    }
    
    gameState.points -= card.price;
    gameState.inventory.push({
        type: card.type,
        name: card.name,
        rarity: card.rarity,
        effect: card.effect
    });
    
    updateUI();
    updateShop();
    showCardModal('✅ Mua thành công!', `<p>Bạn đã mua <strong>${card.name}</strong> với giá <strong>${card.price}</strong> điểm!</p>`);
}

// Battle State (for both boss and minions)
const battleState = {
    isActive: false,
    currentQuestId: null,
    battleType: 'boss', // 'boss' or 'minion'
    playerHP: 100,
    playerMaxHP: 100,
    enemyHP: 100,
    enemyMaxHP: 100,
    playerStats: { strength: 0, speed: 0, durability: 0 },
    enemyStats: { strength: 0, speed: 0, durability: 0 },
    boss: null,
    minions: [], // Array of minions
    currentMinionIndex: 0, // Currently fighting which minion
    round: 0,
    battleLog: [],
    playerTurn: true,
    combatLog: [],
    selectedCrew: [], // Selected crew members (max 3)
    turnOrder: [], // Array of fighters with turn order by speed
    currentTurnerIndex: 0, // Current actor in turn order
    playerDefensing: false,
    enemyDefensing: false,
    playerDefendingLastTurn: false,  // Defense effect applied to next enemy attack
    enemyDefendingLastTurn: false,   // Defense effect applied to next player attack
    playerShield: 0,  // Shield layer for player (absorbs damage before HP)
    enemyShield: 0,   // Shield layer for enemy (absorbs damage before HP)
    crewShields: {},  // Shield for each crew member: { crewParticipantIdx: shieldValue }
    cardCooldowns: {} // Track cooldown for each card: { cardIndex: cooldownRemaining }
};

// Start Battle (Boss)
function startBattle(questId) {
    const quest = gameState.quests.find(q => q.id === questId);
    if (!quest || (!quest.boss && !quest.bosses)) {
        console.log('Quest không có boss');
        return;
    }

    // Reset pending stat gains for new battle
    pendingStatGains = [];

    // Initialize battle
    battleState.isActive = true;
    battleState.currentQuestId = questId;
    battleState.round = 0;
    battleState.battleLog = [];
    battleState.combatLog = [];
    battleState.selectedCrew = [];
    battleState.crewParticipants = []; // { crewIndex, hp, maxHp }
    battleState.turnOrder = [];
    battleState.currentTurnerIndex = 0;
    battleState.cardCooldowns = {}; // Reset card cooldowns

    // Reset per-battle support usage flags on inventory cards
    if (gameState.inventory && gameState.inventory.length > 0) {
        gameState.inventory.forEach(c => {
            if (c && c.type === 'support') delete c._usedThisBattle;
        });
    }

    // Set up player stats (based on character)
    battleState.playerStats = {
        strength: gameState.character.strength,
        speed: gameState.character.speed,
        durability: gameState.character.durability
    };

    // Set up player HP
    battleState.playerMaxHP = 150 + (getStatValue(gameState.character.durability) * 20);
    battleState.playerHP = battleState.playerMaxHP;
    battleState.playerShield = 0;  // Reset player shield
    battleState.enemyShield = 0;   // Reset enemy shield
    battleState.crewShields = {};  // Reset crew shields

    // Check if 2-boss battle
    if (quest.bosses && quest.bosses.length === 2) {
        battleState.battleType = '2boss';
        battleState.bosses = quest.bosses;
        battleState.boss = null;
        battleState.minions = [];
        battleState.currentMinionIndex = 0;

        battleState.boss1Stats = {
            strength: quest.bosses[0].stats[0],
            speed: quest.bosses[0].stats[1],
            durability: quest.bosses[0].stats[2]
        };
        battleState.boss2Stats = {
            strength: quest.bosses[1].stats[0],
            speed: quest.bosses[1].stats[1],
            durability: quest.bosses[1].stats[2]
        };

        // Set up boss HPs
        battleState.boss1MaxHP = 200 + (getStatValue(battleState.boss1Stats.durability) * 20);
        battleState.boss1HP = battleState.boss1MaxHP;
        battleState.boss2MaxHP = 200 + (getStatValue(battleState.boss2Stats.durability) * 20);
        battleState.boss2HP = battleState.boss2MaxHP;
    } else {
        // Single boss battle
        battleState.battleType = 'boss';
        battleState.boss = quest.boss;
        battleState.bosses = [];
        battleState.minions = [];
        battleState.currentMinionIndex = 0;

        // Load minions if they exist
        if (quest.minions && quest.minions.length > 0) {
            battleState.minions = JSON.parse(JSON.stringify(quest.minions)); // Deep copy
            // Initialize minion stats and HP
            battleState.minionStats = battleState.minions.map(m => ({ strength: m.stats[0], speed: m.stats[1], durability: m.stats[2] }));
            battleState.minionMaxHPs = battleState.minionStats.map(s => 60 + (getStatValue(s.durability) * 5));
            battleState.minionHPs = battleState.minionMaxHPs.slice();
        }

        battleState.enemyStats = {
            strength: quest.boss.stats[0],
            speed: quest.boss.stats[1],
            durability: quest.boss.stats[2]
        };

        // Set up enemy HP
        battleState.enemyMaxHP = 200 + (getStatValue(battleState.enemyStats.durability) * 20);
        battleState.enemyHP = battleState.enemyMaxHP;
    }

    // Show crew selection modal if crew exists
    if (gameState.crew.length > 0) {
        showCrewSelectionModal(questId);
    } else {
        // No crew, proceed directly
        initializeTurnOrder();
        showBattleScreen();
    }
}

// Show Crew Selection Modal for battle
function showCrewSelectionModal(questId) {
    let html = `
        <div style="padding: 20px;">
            <p style="margin-bottom: 15px;">Chọn tối đa <strong>3 thành viên</strong> để cùng chiến đấu:</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
    `;
    
    gameState.crew.forEach((member, idx) => {
        html += `
            <div style="padding: 10px; border: 2px solid #3498db; border-radius: 8px; cursor: pointer; text-align: center;" onclick="toggleCrewMember(${idx})">
                <input type="checkbox" id="crew-check-${idx}" style="margin-right: 10px;">
                <strong>${member.name}</strong><br>
                <small>💪${getFormattedStatTier(member.stats[0])} ⚡${getFormattedStatTier(member.stats[1])} 🛡️${getFormattedStatTier(member.stats[2])}</small>
            </div>
        `;
    });
    
    html += `
            </div>
            <div style="text-align: center;">
                <button class="btn btn-success" onclick="startBattleWithCrew()" style="padding: 10px 20px; font-size: 1.1em;">
                    ⚔️ Bắt Đầu Trận Chiến
                </button>
                <button class="btn btn-info" onclick="startBattleWithoutCrew()" style="padding: 10px 20px; font-size: 1.1em; margin-left: 10px;">
                    🚴 Tự Chiến
                </button>
            </div>
        </div>
    `;
    
    showCardModal('📋 Chọn Crew', html);
}

// Toggle crew member selection
function toggleCrewMember(crewIndex) {
    const checkbox = document.getElementById(`crew-check-${crewIndex}`);
    const selected = battleState.selectedCrew.indexOf(crewIndex);
    
    if (checkbox.checked) {
        checkbox.checked = false;
        if (selected !== -1) {
            battleState.selectedCrew.splice(selected, 1);
        }
    } else {
        if (battleState.selectedCrew.length < 3) {
            checkbox.checked = true;
            if (selected === -1) {
                battleState.selectedCrew.push(crewIndex);
            }
        }
    }
}

// Start battle with selected crew
function startBattleWithCrew() {
    closeModal();
    // initialize crewParticipants HPs based on selectedCrew
    battleState.crewParticipants = [];
    battleState.selectedCrew.forEach(crewIdx => {
        const member = gameState.crew[crewIdx];
        if (!member) return;
        const maxHp = 100 + (getStatValue(member.stats[2]) * 10);
        battleState.crewParticipants.push({ crewIndex: crewIdx, hp: maxHp, maxHp: maxHp });
    });
    initializeTurnOrder();
    showBattleScreen();
}

// Start battle without crew
function startBattleWithoutCrew() {
    battleState.selectedCrew = [];
    battleState.crewParticipants = [];
    closeModal();
    initializeTurnOrder();
    showBattleScreen();
}

// Initialize turn order based on speed
function initializeTurnOrder() {
    battleState.turnOrder = [];

    // Add player
    battleState.turnOrder.push({
        type: 'player',
        name: gameState.character.name,
        speed: battleState.playerStats.speed,
        index: -1
    });

    // Ensure crewParticipants exist and initialize if necessary
    if (!battleState.crewParticipants) battleState.crewParticipants = [];
    if (battleState.selectedCrew && battleState.selectedCrew.length > 0 && battleState.crewParticipants.length === 0) {
        // initialize participants based on selectedCrew
        battleState.selectedCrew.forEach(crewIdx => {
            const member = gameState.crew[crewIdx];
            const maxHp = 100 + (getStatValue(member.stats[2]) * 5);
            battleState.crewParticipants.push({ crewIndex: crewIdx, hp: maxHp, maxHp: maxHp, defendingLastTurn: false });
        });
    }

    // Add selected crew members to turn order (use crewParticipants for HP/stats)
    battleState.crewParticipants.forEach(part => {
        const member = gameState.crew[part.crewIndex];
        if (!member) return;
        battleState.turnOrder.push({
            type: 'crew',
            name: member.name,
            speed: member.stats[1], // Speed is second stat
            index: part.crewIndex,
            stats: member.stats
        });
    });

    // Add enemies: for minion battles, add all minions; for boss, add single/double boss
    if (battleState.battleType === 'minion') {
        battleState.minionStats.forEach((ms, idx) => {
            const minionName = battleState.minions[idx].name;
            battleState.turnOrder.push({ type: 'enemy', name: minionName, speed: ms.speed, index: idx, stats: ms });
        });
    } else if (battleState.battleType === '2boss') {
        // Add both bosses
        battleState.turnOrder.push({
            type: 'enemy',
            name: battleState.bosses[0].name,
            speed: battleState.boss1Stats.speed,
            index: 0,
            stats: battleState.boss1Stats
        });
        battleState.turnOrder.push({
            type: 'enemy',
            name: battleState.bosses[1].name,
            speed: battleState.boss2Stats.speed,
            index: 1,
            stats: battleState.boss2Stats
        });
    } else {
        // Single boss
        battleState.turnOrder.push({
            type: 'enemy',
            name: battleState.boss.name,
            speed: battleState.enemyStats.speed,
            index: -1
        });
    }

    // Sort by speed (descending)
    battleState.turnOrder.sort((a, b) => b.speed - a.speed);

    // Log turn order
    console.log('Turn order:', battleState.turnOrder.map(t => `${t.name} (speed: ${t.speed})`));

    battleState.currentTurnerIndex = 0;
}

// Advance to next turn in turn order
function advanceTurnOrder() {
    if (!battleState.turnOrder || battleState.turnOrder.length === 0) {
        console.log('Turn order not initialized');
        return;
    }
    
    // Update defense flags: current defending becomes last-turn defending
    battleState.playerDefendingLastTurn = battleState.playerDefensing;
    battleState.playerDefensing = false;
    battleState.enemyDefendingLastTurn = battleState.enemyDefensing;
    battleState.enemyDefensing = false;
    
    // Update crew defending flags
    if (battleState.crewParticipants) {
        battleState.crewParticipants.forEach(part => {
            if (part.defending) {
                part.defendingLastTurn = true;
                part.defending = false;
            } else {
                part.defendingLastTurn = false;
            }
        });
    }
    
    battleState.currentTurnerIndex++;
    
    // Check if we've completed a full round
    if (battleState.currentTurnerIndex >= battleState.turnOrder.length) {
        battleState.currentTurnerIndex = 0;
        battleState.round++;
    }
    
    // Update battle actions for next fighter
    updateBattleActions();
}

// Decrease card cooldowns at the start of each round
function decreaseCardCooldowns() {
    for (let cardIndex in battleState.cardCooldowns) {
        if (battleState.cardCooldowns[cardIndex] > 0) {
            battleState.cardCooldowns[cardIndex]--;
        }
    }
    console.log('Card cooldowns after round:', battleState.cardCooldowns);
}

// Start Minion Battle
function startMinionBattle(questId) {
    const quest = gameState.quests.find(q => q.id === questId);
    if (!quest || !quest.minions || quest.minions.length === 0) {
        console.log('Quest không có thuộc hạ');
        return;
    }

    // Initialize battle
    battleState.isActive = true;
    battleState.currentQuestId = questId;
    battleState.battleType = 'minion';
    battleState.boss = null;
    battleState.minions = JSON.parse(JSON.stringify(quest.minions)); // Deep copy
    battleState.currentMinionIndex = 0;
    battleState.round = 0;
    battleState.battleLog = [];
    battleState.combatLog = [];
    battleState.selectedCrew = [];
    battleState.crewParticipants = [];

    // For multi-minion battles, initialize stats and HP arrays
    battleState.minionStats = battleState.minions.map(m => ({ strength: m.stats[0], speed: m.stats[1], durability: m.stats[2] }));
    battleState.minionMaxHPs = battleState.minionStats.map(s => 60 + (getStatValue(s.durability) * 5));
    battleState.minionHPs = battleState.minionMaxHPs.slice();

    // Reset per-battle support usage flags on inventory cards
    if (gameState.inventory && gameState.inventory.length > 0) {
        gameState.inventory.forEach(c => {
            if (c && c.type === 'support') delete c._usedThisBattle;
        });
    }

    // Set up player stats (based on character)
    battleState.playerStats = {
        strength: gameState.character.strength,
        speed: gameState.character.speed,
        durability: gameState.character.durability
    };

    // Set up player HP
    battleState.playerMaxHP = 100 + (getStatValue(gameState.character.durability) * 5);
    battleState.playerHP = battleState.playerMaxHP;
    battleState.playerShield = 0;  // Reset player shield
    battleState.enemyShield = 0;   // Reset enemy shield
    battleState.crewShields = {};  // Reset crew shields

    // Default player turn; actual order will be set in initializeTurnOrder
    battleState.playerTurn = true;

    // Initialize turn order and show battle screen
    initializeTurnOrder();
    try {
        showBattleScreen();
    } catch (e) {
        console.error('Error showing battle screen:', e);
    }
}

// Show Battle Screen
function showBattleScreen() {
    const screen = document.getElementById('battleScreen');
    
    // Get player name and stats
    const playerName = gameState.character.name;
    const playerStatStr = getFormattedStatTier(battleState.playerStats.strength);
    const playerStatSpd = getFormattedStatTier(battleState.playerStats.speed);
    const playerStatDur = getFormattedStatTier(battleState.playerStats.durability);
    const playerHPPercent = (battleState.playerHP / battleState.playerMaxHP) * 100;
    const playerShieldPercent = (battleState.playerShield / battleState.playerMaxHP) * 100;
    
    // Update battle title
    const titleEl = document.querySelector('.battle-title');
    if (titleEl) titleEl.textContent = 'Battle Title';

    // Update table header row - Player side
    const headerLeft = document.querySelector('.header-left');
    if (headerLeft) {
        headerLeft.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">${playerName}</div>
            <div style="font-size: 0.9em; color: #3498db; margin-bottom: 8px;">💪${playerStatStr} ⚡${playerStatSpd} 🛡️${playerStatDur}</div>
            <div class="hp-bar-container" id="playerHPContainer">
                <div class="hp-bar-battle" id="playerHPBar" style="width: ${playerHPPercent}%;"></div>
                <div class="hp-bar-shield" id="playerShieldBar" style="width: ${playerShieldPercent}%; background: linear-gradient(90deg, #95a5a6, #7f8c8d); margin-left: ${playerHPPercent}%;"></div>
                <div class="hp-bar-text">${Math.round(battleState.playerHP)}/${battleState.playerMaxHP}${battleState.playerShield > 0 ? ` +🛡️${Math.round(battleState.playerShield)}` : ''}</div>
            </div>
        `;
    }
    
    // Update table header row - Enemy/Boss side
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        let rightHTML = '';
        
        if (battleState.battleType === '2boss') {
            // Show 2 Bosses side by side
            const boss1Name = battleState.bosses && battleState.bosses[0] ? battleState.bosses[0].name : 'Boss 1';
            const boss2Name = battleState.bosses && battleState.bosses[1] ? battleState.bosses[1].name : 'Boss 2';
            const boss1HPPercent = (battleState.boss1HP / battleState.boss1MaxHP) * 100;
            const boss2HPPercent = (battleState.boss2HP / battleState.boss2MaxHP) * 100;
            const isQuest200 = battleState.currentQuestId === 200;
            const boss1HPText = isQuest200 ? '??' : `${Math.round(battleState.boss1HP)}/${battleState.boss1MaxHP}`;
            const boss2HPText = isQuest200 ? '??' : `${Math.round(battleState.boss2HP)}/${battleState.boss2MaxHP}`;
            
            // Format stats - keep plain text for 2boss display
            const boss1PlainStr = battleState.boss1Stats.strength > 18 ? '⚠️ UNMEASURABLE' : getFormattedStatTier(battleState.boss1Stats.strength);
            const boss1PlainSpd = battleState.boss1Stats.speed > 18 ? '⚠️ UNMEASURABLE' : getFormattedStatTier(battleState.boss1Stats.speed);
            const boss1PlainDur = battleState.boss1Stats.durability > 18 ? '⚠️ UNMEASURABLE' : getFormattedStatTier(battleState.boss1Stats.durability);
            
            const boss2PlainStr = battleState.boss2Stats.strength > 18 ? '⚠️ UNMEASURABLE' : getFormattedStatTier(battleState.boss2Stats.strength);
            const boss2PlainSpd = battleState.boss2Stats.speed > 18 ? '⚠️ UNMEASURABLE' : getFormattedStatTier(battleState.boss2Stats.speed);
            const boss2PlainDur = battleState.boss2Stats.durability > 18 ? '⚠️ UNMEASURABLE' : getFormattedStatTier(battleState.boss2Stats.durability);
            
            rightHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%;">
                    <div>
                        <div style="font-weight: bold; margin-bottom: 8px; color: #e74c3c;">${boss1Name}</div>
                        <div style="font-size: 0.9em; margin-bottom: 8px;">💪<span id="boss1StrDisplay">${boss1PlainStr}</span> ⚡<span id="boss1SpdDisplay">${boss1PlainSpd}</span> 🛡️<span id="boss1DurDisplay">${boss1PlainDur}</span></div>
                        <div class="hp-bar-container" id="boss1HPContainer">
                            <div class="hp-bar-battle" id="boss1HPBar" style="width: ${boss1HPPercent}%;"></div>
                            <div class="hp-bar-text" id="boss1HPText">${boss1HPText}</div>
                        </div>
                    </div>
                    <div>
                        <div style="font-weight: bold; margin-bottom: 8px; color: #e74c3c;">${boss2Name}</div>
                        <div style="font-size: 0.9em; margin-bottom: 8px;">💪<span id="boss2StrDisplay">${boss2PlainStr}</span> ⚡<span id="boss2SpdDisplay">${boss2PlainSpd}</span> 🛡️<span id="boss2DurDisplay">${boss2PlainDur}</span></div>
                        <div class="hp-bar-container" id="boss2HPContainer">
                            <div class="hp-bar-battle" id="boss2HPBar" style="width: ${boss2HPPercent}%;"></div>
                            <div class="hp-bar-text" id="boss2HPText">${boss2HPText}</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (battleState.battleType === 'boss') {
            // Show single Boss
            const enemyName = battleState.boss ? battleState.boss.name : 'Enemy';
            const isQuest200 = battleState.currentQuestId === 200;
            let enemyStatStr = 'F', enemyStatSpd = 'F', enemyStatDur = 'F';
            if (!isQuest200 && battleState.enemyStats) {
                enemyStatStr = getFormattedStatTier(battleState.enemyStats.strength);
                enemyStatSpd = getFormattedStatTier(battleState.enemyStats.speed);
                enemyStatDur = getFormattedStatTier(battleState.enemyStats.durability);
            } else {
                enemyStatStr = '??';
                enemyStatSpd = '??';
                enemyStatDur = '??';
            }
            
            const enemyHPPercent = (battleState.enemyHP / battleState.enemyMaxHP) * 100;
            const hpDisplayText = isQuest200 ? '??' : `${Math.round(battleState.enemyHP)}/${battleState.enemyMaxHP}`;
            rightHTML = `
                <div style="font-weight: bold; margin-bottom: 8px;">${enemyName}</div>
                <div style="font-size: 0.9em; margin-bottom: 8px;">💪<span id="enemyStrDisplay">${enemyStatStr}</span> ⚡<span id="enemySpdDisplay">${enemyStatSpd}</span> 🛡️<span id="enemyDurDisplay">${enemyStatDur}</span></div>
                <div class="hp-bar-container" id="bossHPContainer">
                    <div class="hp-bar-battle" id="bossHPBar" style="width: ${enemyHPPercent}%;"></div>
                    <div class="hp-bar-text" id="bossHPText">${hpDisplayText}</div>
                </div>
            `;
        } else {
            // Minion battle - header-right is empty
            rightHTML = '';
        }
        
        headerRight.innerHTML = rightHTML;

        // Apply HP visuals for player and bosses after rendering
        try {
            const playerHPBarEl = document.getElementById('playerHPBar');
            if (playerHPBarEl) applyHPBarVisual(playerHPBarEl, playerHPPercent);
            
            if (battleState.battleType === '2boss') {
                const bp1 = (battleState.boss1HP / battleState.boss1MaxHP) * 100;
                const bp2 = (battleState.boss2HP / battleState.boss2MaxHP) * 100;
                const boss1HPBarEl = document.getElementById('boss1HPBar');
                const boss2HPBarEl = document.getElementById('boss2HPBar');
                if (boss1HPBarEl) applyHPBarVisual(boss1HPBarEl, bp1);
                if (boss2HPBarEl) applyHPBarVisual(boss2HPBarEl, bp2);
                
                // Apply styling to UNMEASURABLE stats in 2boss display
                if (battleState.boss1Stats) {
                    applyStatStyling('boss1StrDisplay', battleState.boss1Stats.strength);
                    applyStatStyling('boss1SpdDisplay', battleState.boss1Stats.speed);
                    applyStatStyling('boss1DurDisplay', battleState.boss1Stats.durability);
                }
                if (battleState.boss2Stats) {
                    applyStatStyling('boss2StrDisplay', battleState.boss2Stats.strength);
                    applyStatStyling('boss2SpdDisplay', battleState.boss2Stats.speed);
                    applyStatStyling('boss2DurDisplay', battleState.boss2Stats.durability);
                }
            } else if (battleState.battleType === 'boss') {
                const bep = (battleState.enemyHP / battleState.enemyMaxHP) * 100;
                const bossHPBarEl = document.getElementById('bossHPBar');
                if (bossHPBarEl) applyHPBarVisual(bossHPBarEl, bep);
                
                // Apply styling to UNMEASURABLE stats in single boss display
                if (battleState.enemyStats) {
                    applyStatStyling('enemyStrDisplay', battleState.enemyStats.strength);
                    applyStatStyling('enemySpdDisplay', battleState.enemyStats.speed);
                    applyStatStyling('enemyDurDisplay', battleState.enemyStats.durability);
                }
            }
        } catch (e) { /* no-op */ }
    }

    // Update left column (crew members)
    const leftColumn = document.querySelector('.left-column');
    if (leftColumn) {
        let crewHTML = '';
        if (battleState.crewParticipants && battleState.crewParticipants.length > 0) {
            battleState.crewParticipants.forEach((part, idx) => {
                const member = gameState.crew[part.crewIndex];
                if (!member) return;
                const hp = Math.max(0, Math.round(part.hp));
                const hpPercent = (hp / part.maxHp) * 100;
                crewHTML += `
                    <div class="crew-member">
                        <div style="font-weight: bold; margin-bottom: 5px;">Crew member ${idx + 1} - ${member.name}</div>
                        <div style="font-size: 0.9em; color: #2ecc71; margin-bottom: 5px;">💪${getFormattedStatTier(member.stats[0])} ⚡${getFormattedStatTier(member.stats[1])} 🛡️${getFormattedStatTier(member.stats[2])}</div>
                        <div class="hp-bar-container" id="crewHPContainer-${part.crewIndex}">
                            <div class="hp-bar-battle" id="crewHPBar-${part.crewIndex}" style="width: ${hpPercent}%;"></div>
                            <span id="crewHPText-${part.crewIndex}" style="position: relative; z-index: 1; font-size: 0.85em;">${hp}/${part.maxHp}</span>
                        </div>
                    </div>
                `;
            });
        }
        if (crewHTML === '') {
            crewHTML = '<div class="crew-member"><div>No crew members</div></div>';
        }
        leftColumn.innerHTML = crewHTML;

        // Apply HP visuals for crew bars
        try {
            if (battleState.crewParticipants && battleState.crewParticipants.length > 0) {
                battleState.crewParticipants.forEach(part => {
                    const hp = Math.max(0, Math.round(part.hp));
                    const hpPercent = (hp / part.maxHp) * 100;
                    applyHPBarVisual(document.getElementById(`crewHPBar-${part.crewIndex}`), hpPercent);
                });
            }
        } catch (e) { /* no-op */ }
    }

    // Update right column (minions)
    const rightColumn = document.querySelector('.right-column');
    if (rightColumn) {
        let minionHTML = '';
        if (battleState.battleType === 'minion' && battleState.minions && battleState.minions.length > 0) {
            battleState.minions.forEach((minion, idx) => {
                const hp = battleState.minionHPs && battleState.minionHPs[idx] !== undefined ? Math.max(0, Math.round(battleState.minionHPs[idx])) : 0;
                const maxHp = battleState.minionMaxHPs && battleState.minionMaxHPs[idx] ? battleState.minionMaxHPs[idx] : 0;
                const hpPercent = maxHp > 0 ? (hp / maxHp) * 100 : 0;
                minionHTML += `
                    <div class="minion">
                        <div style="font-weight: bold; margin-bottom: 5px;">${minion.name}</div>
                        <div style="font-size: 0.9em; color: #f39c12; margin-bottom: 5px;">💪${getFormattedStatTier(minion.stats[0])} ⚡${getFormattedStatTier(minion.stats[1])} 🛡️${getFormattedStatTier(minion.stats[2])}</div>
                        <div class="hp-bar-container" id="minionHPContainer-${idx}">
                            <div class="hp-bar-battle" id="minionHPBar-${idx}" style="width: ${hpPercent}%;"></div>
                            <div class="hp-bar-text">${Math.round(hp)}/${maxHp}</div>
                        </div>
                    </div>
                `;
            });
        }
        rightColumn.innerHTML = minionHTML;

        // Apply HP visuals for minion bars
        try {
            if (battleState.battleType === 'minion' && battleState.minions && battleState.minions.length > 0) {
                battleState.minions.forEach((minion, idx) => {
                    const hp = battleState.minionHPs && battleState.minionHPs[idx] !== undefined ? Math.max(0, Math.round(battleState.minionHPs[idx])) : 0;
                    const maxHp = battleState.minionMaxHPs && battleState.minionMaxHPs[idx] ? battleState.minionMaxHPs[idx] : 0;
                    const hpPercent = maxHp > 0 ? (hp / maxHp) * 100 : 0;
                    applyHPBarVisual(document.getElementById(`minionHPBar-${idx}`), hpPercent);
                });
            }
        } catch (e) { /* no-op */ }
    }

    // Clear battle log
    const battleLog = document.getElementById('battleLog');
    if (battleLog && !battleState.round) {
        battleLog.innerHTML = '<div class="log-entry">⚔️ Trận chiến bắt đầu!</div>';
        if (battleState.playerTurn) {
            battleLog.innerHTML += '<div class="log-entry success">📍 Lượt của bạn!</div>';
        } else {
            battleLog.innerHTML += '<div class="log-entry warning">📍 Lượt của đối thủ!</div>';
        }
    }

    // Show battle actions
    updateBattleActions();

    // Show screen
    if (screen) screen.classList.add('active');
}

// Update Battle Actions
function updateBattleActions() {
    const actionsDiv = document.getElementById('battleActions');
    if (!actionsDiv) {
        console.log('Battle actions div not found');
        return;
    }

    // Check if turn order is initialized
    if (!battleState.turnOrder || battleState.turnOrder.length === 0) {
        console.log('Turn order not initialized, falling back to playerTurn logic');
        if (battleState.playerTurn) {
            // Fallback for battles without crew
            const skillCards = gameState.inventory.filter(c => c.type === 'skill');
            const supportCards = gameState.inventory.filter(c => c.type === 'support');
            
            actionsDiv.innerHTML = `
                <div class="battle-action-group">
                    <button class="btn btn-primary action-btn" onclick="playerAction('attack')">
                        ⚔️ Tấn Công (Sức mạnh)
                    </button>
                    <button class="btn btn-success action-btn" onclick="playerAction('defend')">
                        🛡️ Phòng Thủ (Giảm sát thương)
                    </button>
                    ${skillCards.length > 0 ? `<button class="btn btn-info action-btn" onclick="showSkillCards()">💥 Thẻ Kỹ Năng (${skillCards.length})</button>` : ''}
                    ${supportCards.length > 0 ? `<button class="btn btn-success action-btn" onclick="showSupportCards()">💊 Thẻ Hỗ Trợ (${supportCards.length})</button>` : ''}
                </div>
                <div class="battle-info">
                    <span>HP: ${Math.round(battleState.playerHP)}/${battleState.playerMaxHP}</span>
                    <span>Lượt: ${battleState.round + 1}</span>
                </div>
            `;
        } else {
            actionsDiv.innerHTML = `
                <div class="battle-action-group">
                    <div class="loading-spinner"></div>
                    <span>🤖 Đối thủ đang suy nghĩ...</span>
                </div>
            `;
            setTimeout(() => {
                if (battleState.isActive && !battleState.playerTurn) {
                    enemyAction();
                }
            }, BATTLE_TIMING.ENEMY_RESPONSE_TIME);
        }
        return;
    }

    // Use turn order system
    const currentFighter = battleState.turnOrder[battleState.currentTurnerIndex];
    
    if (currentFighter.type === 'player') {
        console.log('updateBattleActions: Player turn (turn order system)');
        
        // Count skill and support cards in inventory
        const skillCards = gameState.inventory.filter(c => c.type === 'skill');
        const supportCards = gameState.inventory.filter(c => c.type === 'support');
        
        actionsDiv.innerHTML = `
            <div class="battle-action-group">
                <button class="btn btn-primary action-btn" onclick="playerActionTurnOrder('attack')">
                    ⚔️ Tấn Công (Sức mạnh)
                </button>
                <button class="btn btn-success action-btn" onclick="playerActionTurnOrder('defend')">
                    🛡️ Phòng Thủ (Giảm sát thương)
                </button>
                ${skillCards.length > 0 ? `<button class="btn btn-info action-btn" onclick="showSkillCards()">💥 Thẻ Kỹ Năng (${skillCards.length})</button>` : ''}
                ${supportCards.length > 0 ? `<button class="btn btn-success action-btn" onclick="showSupportCards()">💊 Thẻ Hỗ Trợ (${supportCards.length})</button>` : ''}
            </div>
            <div class="battle-info">
                <span>HP: ${Math.round(battleState.playerHP)}/${battleState.playerMaxHP}</span>
                <span>Lượt: ${battleState.round + 1}</span>
            </div>
        `;
    } else if (currentFighter.type === 'crew') {
        console.log('Crew member turn:', currentFighter.name);
        
        actionsDiv.innerHTML = `
            <div class="battle-action-group">
                <div class="loading-spinner"></div>
                <span>🎖️ ${currentFighter.name} đang hành động...</span>
            </div>
        `;
        
        setTimeout(() => {
            if (battleState.isActive) {
                crewMemberAction();
            }
        }, BATTLE_TIMING.ENEMY_RESPONSE_TIME);
    } else if (currentFighter.type === 'enemy') {
        console.log('Enemy turn:', currentFighter.name);
        
        actionsDiv.innerHTML = `
            <div class="battle-action-group">
                <div class="loading-spinner"></div>
                <span>🤖 Đối thủ đang suy nghĩ...</span>
            </div>
        `;
        
        setTimeout(() => {
            if (battleState.isActive) {
                enemyActionTurnOrder();
            }
        }, BATTLE_TIMING.ENEMY_RESPONSE_TIME);
    }
}

// Player Action
function playerAction(action) {
    console.log('playerAction called:', action, 'playerTurn=', battleState.playerTurn, 'isActive=', battleState.isActive);
    if (!battleState.playerTurn || !battleState.isActive) {
        console.log('playerAction blocked!');
        return;
    }

    // Reduce cooldowns at the start of player's turn
    decreaseCardCooldowns();

    let damage = 0;
    let logMessage = '';

    // Helper: pick random alive minion index
    function pickRandomAliveMinion() {
        if (!battleState.minionHPs) return -1;
        const alive = [];
        battleState.minionHPs.forEach((hp, i) => { if (hp > 0) alive.push(i); });
        if (alive.length === 0) return -1;
        return alive[Math.floor(Math.random() * alive.length)];
    }

    switch (action) {
        case 'attack':
            if (battleState.battleType === 'boss') {
                damage = calculateDamage(battleState.playerStats.strength, battleState.enemyStats.durability, 'attack');
            } else {
                const targetIdx = pickRandomAliveMinion();
                if (targetIdx >= 0) {
                    damage = calculateDamage(battleState.playerStats.strength, battleState.minionStats[targetIdx].durability, 'attack');
                    // apply directly to chosen minion
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - damage);
                    addBattleLog(`💥 ${gameState.character.name} tấn công ${battleState.minions[targetIdx].name}! Sát thương: ${damage}`);
                } else {
                    damage = 0;
                }
            }
            if (battleState.battleType === 'boss' && damage > 0) logMessage = `💥 ${gameState.character.name} tấn công với sức mạnh! Sát thương: ${damage}`;
            break;

        case 'defend':
            battleState.playerDefensing = true;
            logMessage = `🛡️ ${gameState.character.name} phòng thủ! Sát thương tiếp theo sẽ giảm 50%`;
            damage = 0;
            break;

        case 'skill':
            if (battleState.battleType === 'boss') {
                damage = calculateDamage(battleState.playerStats.strength, battleState.enemyStats.durability, 'skill');
                battleState.enemyHP = Math.max(0, battleState.enemyHP - damage);
                logMessage = `⚡ ${gameState.character.name} sử dụng kỹ năng kết hợp! Sát thương: ${damage}`;
            } else {
                const targetIdx = pickRandomAliveMinion();
                if (targetIdx >= 0) {
                    damage = calculateDamage(battleState.playerStats.strength, battleState.minionStats[targetIdx].durability, 'skill');
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - damage);
                    addBattleLog(`⚡ ${gameState.character.name} sử dụng kỹ năng lên ${battleState.minions[targetIdx].name}! Sát thương: ${damage}`);
                }
            }
            break;
    }

    // If boss attack already applied, update enemy HP bar
    if (battleState.battleType === 'boss' && damage > 0) {
        battleState.enemyHP = Math.max(0, battleState.enemyHP - 0); // already applied for skill/calc where needed
        updateEnemyHPBar();
    } else if (battleState.battleType === 'minion') {
        updateEnemyHPBar();
    }

    if (logMessage) addBattleLog(logMessage);

    // Crew members (selected participants) also attack
    if (battleState.crewParticipants && battleState.crewParticipants.length > 0) {
        battleState.crewParticipants.forEach(part => {
            if (!part || part.hp <= 0) return; // defeated
            const member = gameState.crew[part.crewIndex];
            if (!member) return;

            // choose target for this crew member
            if (battleState.battleType === 'boss') {
                const crewDamage = calculateDamage(member.stats[0], battleState.enemyStats.durability, 'attack');
                battleState.enemyHP = Math.max(0, battleState.enemyHP - crewDamage);
                addBattleLog(`   ↳ 👥 ${member.name} cùng tấn công boss! Sát thương: ${crewDamage}`);
            } else {
                const targetIdx = (function(){
                    if (!battleState.minionHPs) return -1;
                    const alive = [];
                    battleState.minionHPs.forEach((hp, i) => { if (hp > 0) alive.push(i); });
                    if (alive.length === 0) return -1;
                    return alive[Math.floor(Math.random() * alive.length)];
                })();
                if (targetIdx >= 0) {
                    const crewDamage = calculateDamage(member.stats[0], battleState.minionStats[targetIdx].durability, 'attack');
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - crewDamage);
                    addBattleLog(`   ↳ 👥 ${member.name} tấn công ${battleState.minions[targetIdx].name}! Sát thương: ${crewDamage}`);
                }
            }
        });
        updateEnemyHPBar();
    }

    // Check for victory
    if (battleState.battleType === 'boss') {
        if (battleState.enemyHP <= 0) { endBattle(true); return; }
    } else {
        const anyAlive = battleState.minionHPs && battleState.minionHPs.some(h => h > 0);
        if (!anyAlive) { endBattle(true); return; }
    }

    // Next round
    battleState.round++;
    battleState.playerTurn = false;
    updateBattleActions();
}

// Helper: Apply defense reduction to player damage if enemy defended last turn
function applyEnemyDefenseReduction(damage) {
    if (battleState.enemyDefendingLastTurn && damage > 0) {
        damage = Math.ceil(damage * 0.5);
    }
    return damage;
}

// Helper: Apply defense reduction to enemy damage if player defended last turn
function applyPlayerDefenseReduction(damage) {
    if (battleState.playerDefendingLastTurn && damage > 0) {
        damage = Math.ceil(damage * 0.5);
    }
    return damage;
}

// Helper: Apply defense reduction to enemy damage if crew member defended last turn
function applyCrewDefenseReduction(crewIdx, damage) {
    if (battleState.crewParticipants && battleState.crewParticipants[crewIdx]) {
        const defending = battleState.crewParticipants[crewIdx].defendingLastTurn;
        if (defending && damage > 0) {
            damage = Math.ceil(damage * 0.5);
        }
    }
    return damage;
}

// Helper: Apply damage to player, reducing shield first then HP
function applyDamageToPlayer(damage) {
    if (damage <= 0) return;
    // Reduce shield first
    if (battleState.playerShield > 0) {
        const shieldAbsorb = Math.min(battleState.playerShield, damage);
        battleState.playerShield -= shieldAbsorb;
        damage -= shieldAbsorb;
    }
    // Then reduce HP
    if (damage > 0) {
        battleState.playerHP = Math.max(0, battleState.playerHP - damage);
    }
}

// TURN ORDER SYSTEM FUNCTIONS
// Player Action with Turn Order
function playerActionTurnOrder(action) {
    console.log('playerActionTurnOrder called:', action);
    if (!battleState.isActive) {
        return;
    }

    // Reduce cooldowns at the start of player's turn
    decreaseCardCooldowns();

    let damage = 0;
    let logMessage = '';

    function pickRandomAliveMinion() {
        if (!battleState.minionHPs) return -1;
        const alive = [];
        battleState.minionHPs.forEach((hp, i) => { if (hp > 0) alive.push(i); });
        if (alive.length === 0) return -1;
        return alive[Math.floor(Math.random() * alive.length)];
    }

    switch (action) {
        case 'attack':
            if (battleState.battleType === 'boss') {
                damage = calculateDamage(battleState.playerStats.strength, battleState.enemyStats.durability, 'attack');
                damage = applyEnemyDefenseReduction(damage);
                battleState.enemyHP = Math.max(0, battleState.enemyHP - damage);
                logMessage = `💥 ${gameState.character.name} tấn công với sức mạnh! Sát thương: ${damage}`;
            } else if (battleState.battleType === '2boss') {
                // For 2-boss, attack the boss with higher HP (priority)
                const boss1IsDead = battleState.boss1HP <= 0;
                const boss2IsDead = battleState.boss2HP <= 0;
                
                let targetBoss = 0; // Default to boss 0
                if (!boss1IsDead && boss2IsDead) targetBoss = 0;
                else if (boss1IsDead && !boss2IsDead) targetBoss = 1;
                else if (!boss1IsDead && !boss2IsDead) {
                    targetBoss = battleState.boss1HP > battleState.boss2HP ? 0 : 1; // Attack weaker
                }
                
                if (targetBoss === 0) {
                    damage = calculateDamage(battleState.playerStats.strength, battleState.boss1Stats.durability, 'attack');
                    damage = applyEnemyDefenseReduction(damage);
                    battleState.boss1HP = Math.max(0, battleState.boss1HP - damage);
                    logMessage = `💥 ${gameState.character.name} tấn công ${battleState.bosses[0].name}! Sát thương: ${damage}`;
                } else {
                    damage = calculateDamage(battleState.playerStats.strength, battleState.boss2Stats.durability, 'attack');
                    damage = applyEnemyDefenseReduction(damage);
                    battleState.boss2HP = Math.max(0, battleState.boss2HP - damage);
                    logMessage = `💥 ${gameState.character.name} tấn công ${battleState.bosses[1].name}! Sát thương: ${damage}`;
                }
            } else {
                const targetIdx = pickRandomAliveMinion();
                if (targetIdx >= 0) {
                    damage = calculateDamage(battleState.playerStats.strength, battleState.minionStats[targetIdx].durability, 'attack');
                    damage = applyEnemyDefenseReduction(damage);
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - damage);
                    logMessage = `💥 ${gameState.character.name} tấn công ${battleState.minions[targetIdx].name}! Sát thương: ${damage}`;
                }
            }
            break;

        case 'defend':
            battleState.playerDefensing = true;
            logMessage = `🛡️ ${gameState.character.name} phòng thủ! Sát thương tiếp theo sẽ giảm 50%`;
            damage = 0;
            break;

        case 'skill':
            if (battleState.battleType === 'boss') {
                damage = calculateDamage(battleState.playerStats.strength, battleState.enemyStats.durability, 'skill');
                damage = applyEnemyDefenseReduction(damage);
                battleState.enemyHP = Math.max(0, battleState.enemyHP - damage);
                logMessage = `⚡ ${gameState.character.name} sử dụng kỹ năng kết hợp! Sát thương: ${damage}`;
            } else if (battleState.battleType === '2boss') {
                // For 2-boss, skill attacks both bosses
                const damage1 = calculateDamage(battleState.playerStats.strength, battleState.boss1Stats.durability, 'skill');
                const damage1Reduced = applyEnemyDefenseReduction(damage1);
                const damage2 = calculateDamage(battleState.playerStats.strength, battleState.boss2Stats.durability, 'skill');
                const damage2Reduced = applyEnemyDefenseReduction(damage2);
                battleState.boss1HP = Math.max(0, battleState.boss1HP - damage1Reduced);
                battleState.boss2HP = Math.max(0, battleState.boss2HP - damage2Reduced);
                damage = damage1Reduced + damage2Reduced;
                logMessage = `⚡ ${gameState.character.name} sử dụng kỹ năng kết hợp lên cả hai Boss! Sát thương: ${damage1Reduced} + ${damage2Reduced}`;
            } else {
                const targetIdx = pickRandomAliveMinion();
                if (targetIdx >= 0) {
                    damage = calculateDamage(battleState.playerStats.strength, battleState.minionStats[targetIdx].durability, 'skill');
                    damage = applyEnemyDefenseReduction(damage);
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - damage);
                    logMessage = `⚡ ${gameState.character.name} sử dụng kỹ năng lên ${battleState.minions[targetIdx].name}! Sát thương: ${damage}`;
                }
            }
            break;
    }

    if (damage > 0) updateEnemyHPBar();

    addBattleLog(logMessage);

    // Check for victory
    if (battleState.battleType === 'boss') {
        if (battleState.enemyHP <= 0) { endBattle(true); return; }
    } else if (battleState.battleType === '2boss') {
        if (battleState.boss1HP <= 0 && battleState.boss2HP <= 0) { endBattle(true); return; }
    } else {
        const anyAlive = battleState.minionHPs && battleState.minionHPs.some(h => h > 0);
        if (!anyAlive) { endBattle(true); return; }
    }

    // Move to next turn
    advanceTurnOrder();
}

// Crew Member Action
function crewMemberAction() {
    console.log('crewMemberAction executing...');
    if (!battleState.isActive) {
        return;
    }

    const currentFighter = battleState.turnOrder[battleState.currentTurnerIndex];
    if (currentFighter.type !== 'crew') {
        console.log('Error: Current fighter is not crew');
        return;
    }

    // Ensure the crew participant is still alive (find by crewIndex)
    if (!battleState.crewParticipants || battleState.crewParticipants.length === 0) {
        console.log('No crew participants available, skipping crew action');
        advanceTurnOrder();
        return;
    }
    const participantIdx = battleState.crewParticipants.findIndex(p => p.crewIndex === currentFighter.index);
    if (participantIdx === -1) {
        console.log('Crew participant not found for crewIndex', currentFighter.index, 'skipping');
        advanceTurnOrder();
        return;
    }
    const participant = battleState.crewParticipants[participantIdx];
    if (!participant || participant.hp <= 0) {
        console.log('Crew participant dead or no HP, skipping turn for crewIndex', currentFighter.index);
        advanceTurnOrder();
        return;
    }

    const crewMember = gameState.crew[currentFighter.index];
    const actions = ['attack', 'attack', 'attack', 'defend', 'skill'];
    const selectedAction = actions[Math.floor(Math.random() * actions.length)];
    
    let damage = 0;
    let logMessage = '';

    function pickRandomAliveMinion() {
        if (!battleState.minionHPs) return -1;
        const alive = [];
        battleState.minionHPs.forEach((hp, i) => { if (hp > 0) alive.push(i); });
        if (alive.length === 0) return -1;
        return alive[Math.floor(Math.random() * alive.length)];
    }

    switch (selectedAction) {
        case 'attack':
            if (battleState.battleType === 'boss') {
                damage = calculateDamage(crewMember.stats[0], battleState.enemyStats.durability, 'attack');
                battleState.enemyHP = Math.max(0, battleState.enemyHP - damage);
                logMessage = `🎖️ ${crewMember.name} tấn công boss! Sát thương: ${damage}`;
            } else {
                const targetIdx = pickRandomAliveMinion();
                if (targetIdx >= 0) {
                    damage = calculateDamage(crewMember.stats[0], battleState.minionStats[targetIdx].durability, 'attack');
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - damage);
                    logMessage = `🎖️ ${crewMember.name} tấn công ${battleState.minions[targetIdx].name}! Sát thương: ${damage}`;
                }
            }
            break;

        case 'defend':
            logMessage = `🎖️ ${crewMember.name} phòng thủ!`;
            participant.defending = true;
            damage = 0;
            break;

        case 'skill':
            if (battleState.battleType === 'boss') {
                damage = calculateDamage(crewMember.stats[0], battleState.enemyStats.durability, 'skill');
                battleState.enemyHP = Math.max(0, battleState.enemyHP - damage);
                logMessage = `🎖️ ${crewMember.name} sử dụng kỹ năng lên boss! Sát thương: ${damage}`;
            } else {
                const targetIdx = pickRandomAliveMinion();
                if (targetIdx >= 0) {
                    damage = calculateDamage(crewMember.stats[0], battleState.minionStats[targetIdx].durability, 'skill');
                    battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - damage);
                    logMessage = `🎖️ ${crewMember.name} sử dụng kỹ năng lên ${battleState.minions[targetIdx].name}! Sát thương: ${damage}`;
                }
            }
            break;
    }

    if (damage > 0) updateEnemyHPBar();
    addBattleLog(logMessage);

    // Check for victory
    if (battleState.battleType === 'boss') {
        if (battleState.enemyHP <= 0) { endBattle(true); return; }
    } else {
        const anyAlive = battleState.minionHPs && battleState.minionHPs.some(h => h > 0);
        if (!anyAlive) { endBattle(true); return; }
    }

    // Move to next turn
    advanceTurnOrder();
}

// Enemy Action with Turn Order
function enemyActionTurnOrder() {
    console.log('enemyActionTurnOrder executing...');
    if (!battleState.isActive) {
        return;
    }

    const currentFighter = battleState.turnOrder[battleState.currentTurnerIndex];
    if (currentFighter.type !== 'enemy') {
        console.log('Error: Current fighter is not enemy');
        return;
    }

    // CHECK IF MINION IS STILL ALIVE (for minion battles)
    if (battleState.battleType === 'minion') {
        const minionIdx = currentFighter.index;
        if (battleState.minionHPs[minionIdx] <= 0) {
            console.log(`Minion ${battleState.minions[minionIdx].name} is dead, skipping turn`);
            advanceTurnOrder();
            return;
        }
    } else if (battleState.battleType === '2boss') {
        // For 2-boss battle, check if the current boss is still alive
        const bossIdx = currentFighter.index; // 0 or 1
        if (bossIdx === 0 && battleState.boss1HP <= 0) {
            console.log('Boss 1 is dead, skipping turn');
            advanceTurnOrder();
            return;
        }
        if (bossIdx === 1 && battleState.boss2HP <= 0) {
            console.log('Boss 2 is dead, skipping turn');
            advanceTurnOrder();
            return;
        }
    } else {
        // For single boss battle, check if boss is still alive
        if (battleState.enemyHP <= 0) {
            console.log('Boss is dead, skipping turn');
            advanceTurnOrder();
            return;
        }
    }

    let damage = 0;
    let logMessage = '';
    let targetType = null;
    let targetIndex = null;

    // Helper: Build list of alive targets (MC + crew)
    function getAliveTargets() {
        const targets = [];
        // Always include MC if alive
        if (battleState.playerHP > 0) {
            targets.push({ type: 'player', index: -1, name: gameState.character.name });
        }
        // Include alive crew members
        if (battleState.crewParticipants && battleState.crewParticipants.length > 0) {
            battleState.crewParticipants.forEach((participant, idx) => {
                if (participant.hp > 0) {
                    const crewMember = gameState.crew[participant.crewIndex];
                    targets.push({ type: 'crew', index: idx, name: crewMember.name });
                }
            });
        }
        return targets;
    }

    // Pick random target from alive list
    const aliveTargets = getAliveTargets();
    if (aliveTargets.length === 0) {
        // All targets defeated - shouldn't happen, but safety check
        console.log('No alive targets for enemy attack');
        advanceTurnOrder();
        return;
    }
    const selectedTarget = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];

    // Determine enemy stats
    let enemyStats = null;
    let enemyName = '';
    
    if (battleState.battleType === '2boss') {
        const bossIdx = currentFighter.index; // 0 or 1
        if (bossIdx === 0) {
            enemyStats = battleState.boss1Stats;
            enemyName = battleState.bosses[0].name;
        } else {
            enemyStats = battleState.boss2Stats;
            enemyName = battleState.bosses[1].name;
        }
    } else if (battleState.battleType === 'boss') {
        enemyStats = battleState.enemyStats;
        enemyName = 'Boss';
    } else {
        // Minion battle - current fighter has minion index
        const minionIdx = currentFighter.index;
        enemyStats = battleState.minionStats[minionIdx];
        enemyName = battleState.minions[minionIdx].name;
    }

    const actions = ['attack', 'attack', 'attack', 'defend', 'skill'];
    const action = actions[Math.floor(Math.random() * actions.length)];

    switch (action) {
        case 'attack':
            if (selectedTarget.type === 'player') {
                damage = calculateDamage(enemyStats.strength, battleState.playerStats.durability, 'attack');
                damage = applyPlayerDefenseReduction(damage);
                applyDamageToPlayer(damage);
                logMessage = `💢 ${enemyName} tấn công ${selectedTarget.name}! Sát thương: ${damage}`;
                updatePlayerHPBar();
                
                if (battleState.playerHP <= 0) {
                    logMessage += ` 💀`;
                    addBattleLog(logMessage);
                    endBattle(false);
                    return;
                }
            } else if (selectedTarget.type === 'crew') {
                const crewIdx = selectedTarget.index;
                const crewMember = gameState.crew[battleState.crewParticipants[crewIdx].crewIndex];
                damage = calculateDamage(enemyStats.strength, crewMember.stats[2], 'attack');
                damage = applyCrewDefenseReduction(crewIdx, damage);
                battleState.crewParticipants[crewIdx].hp = Math.max(0, battleState.crewParticipants[crewIdx].hp - damage);
                logMessage = `💢 ${enemyName} tấn công ${selectedTarget.name}! Sát thương: ${damage}`;
                updateCrewHPBar(crewIdx);
                
                if (battleState.crewParticipants[crewIdx].hp <= 0) {
                    logMessage += ` 💀`;
                }
            }
            break;

        case 'defend':
            logMessage = `🛡️ ${enemyName} phòng thủ!`;
            damage = 0;
            break;

        case 'skill':
            if (selectedTarget.type === 'player') {
                damage = calculateDamage(enemyStats.strength, battleState.playerStats.durability, 'skill');
                damage = applyPlayerDefenseReduction(damage);
                applyDamageToPlayer(damage);
                logMessage = `⚡ ${enemyName} sử dụng kỹ năng lên ${selectedTarget.name}! Sát thương: ${damage}`;
                updatePlayerHPBar();
                
                if (battleState.playerHP <= 0) {
                    logMessage += ` 💀`;
                    addBattleLog(logMessage);
                    endBattle(false);
                    return;
                }
            } else if (selectedTarget.type === 'crew') {
                const crewIdx = selectedTarget.index;
                const crewMember = gameState.crew[battleState.crewParticipants[crewIdx].crewIndex];
                damage = calculateDamage(enemyStats.strength, crewMember.stats[2], 'skill');
                damage = applyCrewDefenseReduction(crewIdx, damage);
                battleState.crewParticipants[crewIdx].hp = Math.max(0, battleState.crewParticipants[crewIdx].hp - damage);
                logMessage = `⚡ ${enemyName} sử dụng kỹ năng lên ${selectedTarget.name}! Sát thương: ${damage}`;
                updateCrewHPBar(crewIdx);
                
                if (battleState.crewParticipants[crewIdx].hp <= 0) {
                    logMessage += ` 💀`;
                }
            }
            break;
    }

    addBattleLog(logMessage);

    // Update HP bars if damage was dealt
    updatePlayerHPBar();
    updateEnemyHPBar();

    // Move to next turn
    advanceTurnOrder();
}

// Enemy AI Action
function enemyAction() {
    if (battleState.playerTurn || !battleState.isActive) {
        console.log('enemyAction blocked: playerTurn=', battleState.playerTurn, 'isActive=', battleState.isActive);
        return;
    }

    console.log('enemyAction executing...', battleState.battleType);

    // Get current enemy name (boss or minion)
    const enemyName = battleState.battleType === 'boss' 
        ? battleState.boss.name 
        : battleState.minions[battleState.currentMinionIndex].name;

    const actions = ['attack', 'attack', 'attack', 'defend', 'skill'];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    let damage = 0;
    let logMessage = '';

    switch (action) {
        case 'attack':
            damage = calculateDamage(
                battleState.enemyStats.strength,
                battleState.playerStats.durability,
                'attack'
            );
            logMessage = `💥 ${enemyName} tấn công! Sát thương: ${damage}`;
            break;

        case 'defend':
            battleState.enemyDefensing = true;
            logMessage = `🛡️ ${enemyName} phòng thủ!`;
            damage = 0;
            break;

        case 'skill':
            damage = calculateDamage(
                battleState.enemyStats.strength,
                battleState.playerStats.durability,
                'skill'
            );
            logMessage = `⚡ ${enemyName} sử dụng kỹ năng! Sát thương: ${damage}`;
            break;
    }

    // Apply damage reduction if player defended last turn
    if (battleState.playerDefendingLastTurn && damage > 0) {
        damage = Math.ceil(damage * 0.5);
        logMessage += ` (Phòng thủ giảm 50%: ${damage})`;
    }
    // Move current defend to last turn for next round
    battleState.playerDefendingLastTurn = battleState.playerDefensing;
    battleState.playerDefensing = false;

    // Move enemy defend to last turn for next round (CRITICAL: was missing!)
    battleState.enemyDefendingLastTurn = battleState.enemyDefensing;
    battleState.enemyDefensing = false;

    // Apply damage to player (shield first, then HP)
    if (damage > 0) {
        applyDamageToPlayer(damage);
        updatePlayerHPBar();
    }

    addBattleLog(logMessage);

    // Check if player is defeated
    if (battleState.playerHP <= 0) {
        endBattle(false); // Lose
        return;
    }

    // Back to player turn
    battleState.playerTurn = true;
    updateBattleActions();
}

// Show Skill Cards
function showSkillCards() {
    // Reduce cooldowns at the start of showing skills
    decreaseCardCooldowns();
    
    const skillCards = gameState.inventory.filter(c => c.type === 'skill');
    if (skillCards.length === 0) {
        alert('Bạn không có thẻ kỹ năng!');
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">';
    skillCards.forEach((card, idx) => {
        const actualIndex = gameState.inventory.indexOf(card);
        const cooldown = battleState.cardCooldowns[actualIndex] || 0;
        const isOnCooldown = cooldown > 0;
        const buttonClass = isOnCooldown ? 'btn btn-secondary' : 'btn btn-info';
        const buttonText = isOnCooldown ? `💥 ${card.name}<br><small>Lượt còn lại: ${cooldown}</small>` : `💥 ${card.name}<br><small>${card.effect}</small>`;
        const onclickAttr = isOnCooldown ? '' : `onclick="useSkillCard(${actualIndex})"`;
        const disabledStyle = isOnCooldown ? 'opacity: 0.6; cursor: not-allowed;' : '';
        
        html += `
            <button class="${buttonClass}" ${onclickAttr} style="width: 100%; padding: 10px; ${disabledStyle}">
                ${buttonText}
            </button>
        `;
    });
    html += '</div>';
    
    showCardModal('Chọn Thẻ Kỹ Năng', html);
}

// Use Skill Card in battle
function useSkillCard(cardIndex) {
    const card = gameState.inventory[cardIndex];
    if (!card || card.type !== 'skill') return;
    
    // Check if card is on cooldown
    if (battleState.cardCooldowns[cardIndex] && battleState.cardCooldowns[cardIndex] > 0) {
        alert(`⏰ Thẻ "${card.name}" đang bị khóa! Còn ${battleState.cardCooldowns[cardIndex]} lượt.`);
        return;
    }
    
    closeModal();
    
    let totalDamage = 0;
    let logMessage = '';
    
    // Parse skill card effect to get bonus damage
    let skillBonus = 0;
    if (card.effect && card.effect.includes('damage+')) {
        skillBonus = parseInt(card.effect.replace('damage+', ''));
    }
    
    if (battleState.battleType === 'boss') {
        // Boss battle
        const baseDamage = calculateDamage(
            battleState.playerStats.strength,
            battleState.enemyStats.durability,
            'skill'
        );
        totalDamage = baseDamage + skillBonus;
        logMessage = `💥 ${gameState.character.name} sử dụng [${card.name}]! Sát thương: ${totalDamage}`;
        addBattleLog(logMessage);
        
        battleState.enemyHP = Math.max(0, battleState.enemyHP - totalDamage);
        updateEnemyHPBar();
        
        // Check if enemy is defeated
        if (battleState.enemyHP <= 0) {
            endBattle(true);
        }
    } else {
        // Minion battle
        const targetIdx = (function(){
            if (!battleState.minionHPs) return -1;
            const alive = [];
            battleState.minionHPs.forEach((hp, i) => { if (hp > 0) alive.push(i); });
            if (alive.length === 0) return -1;
            return alive[Math.floor(Math.random() * alive.length)];
        })();
        
        if (targetIdx >= 0) {
            const baseDamage = calculateDamage(
                battleState.playerStats.strength,
                battleState.minionStats[targetIdx].durability,
                'skill'
            );
            totalDamage = baseDamage + skillBonus;
            logMessage = `💥 ${gameState.character.name} sử dụng [${card.name}] lên ${battleState.minions[targetIdx].name}! Sát thương: ${totalDamage}`;
            addBattleLog(logMessage);
            
            battleState.minionHPs[targetIdx] = Math.max(0, battleState.minionHPs[targetIdx] - totalDamage);
            updateEnemyHPBar();
            
            // Check if all minions are defeated
            const anyAlive = battleState.minionHPs && battleState.minionHPs.some(h => h > 0);
            if (!anyAlive) {
                endBattle(true);
            }
        }
    }
    
    // Set cooldown for this specific card (1 turn cooldown)
    battleState.cardCooldowns[cardIndex] = 1;
    
    // Advance to next turn
    if (battleState.turnOrder && battleState.turnOrder.length > 0) {
        advanceTurnOrder();
    } else {
        // Fallback for non-turn order battles
        battleState.round++;
        battleState.playerTurn = false;
        updateBattleActions();
    }
}

// Show Support Cards
function showSupportCards() {
    // Reduce cooldowns at the start of showing supports
    decreaseCardCooldowns();
    
    const supportCards = gameState.inventory.filter(c => c.type === 'support');
    if (supportCards.length === 0) {
        alert('Bạn không có thẻ hỗ trợ!');
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">';
    supportCards.forEach((card, idx) => {
        const actualIndex = gameState.inventory.indexOf(card);
        const cooldown = battleState.cardCooldowns[actualIndex] || 0;
        const isOnCooldown = cooldown > 0;
        const isUsedThisBattle = !!card._usedThisBattle;
        const buttonClass = isOnCooldown ? 'btn btn-secondary' : 'btn btn-success';
        const buttonText = isOnCooldown ? `💊 ${card.name}<br><small>Lượt còn lại: ${cooldown}</small>` : (isUsedThisBattle ? `💊 ${card.name}<br><small>Đã dùng trong trận</small>` : `💊 ${card.name}<br><small>${card.effect}</small>`);
        const onclickAttr = (isOnCooldown || isUsedThisBattle) ? '' : `onclick="useSupportCard(${actualIndex})"`;
        const disabledStyle = (isOnCooldown || isUsedThisBattle) ? 'opacity: 0.6; cursor: not-allowed;' : '';
        
        html += `
            <button class="${buttonClass}" ${onclickAttr} style="width: 100%; padding: 10px; ${disabledStyle}">
                ${buttonText}
            </button>
        `;
    });
    html += '</div>';
    
    showCardModal('Chọn Thẻ Hỗ Trợ', html);
}

// Use Support Card in battle
function useSupportCard(cardIndex) {
    const card = gameState.inventory[cardIndex];
    if (!card || card.type !== 'support') return;
    
    // Check if card is on cooldown
    if (battleState.cardCooldowns[cardIndex] && battleState.cardCooldowns[cardIndex] > 0) {
        alert(`⏰ Thẻ "${card.name}" đang bị khóa! Còn ${battleState.cardCooldowns[cardIndex]} lượt.`);
        return;
    }
    // Check if card was already used this battle
    if (card._usedThisBattle) {
        alert(`❗ Thẻ "${card.name}" chỉ được sử dụng 1 lần mỗi trận.`);
        return;
    }
    
    closeModal();
    
    let effect = 0;
    let isShield = false;
    let logMessage = '';
    
    // Determine if this is a heal or shield card
    if (card.effect && card.effect.includes('shield')) {
        isShield = true;
        // Parse shield value: shield+10, shield+30, shield+50, shield+10%, shield+30%, shield+50%
        const match = card.effect.match(/\d+/);
        const value = match ? parseInt(match[0]) : 10;
        
        if (card.effect.includes('%')) {
            effect = Math.round(battleState.playerMaxHP * (value / 100));
        } else {
            effect = value;
        }
        battleState.playerShield += effect;
        logMessage = `🛡️ ${gameState.character.name} sử dụng [${card.name}]! Khiên: +${effect}`;
    } else {
        // Heal card
        const supportEffects = {
            'heal+10%': () => battleState.playerMaxHP * 0.1,
            'heal+30%': () => battleState.playerMaxHP * 0.3,
            'heal+70%': () => battleState.playerMaxHP * 0.7,
            'heal+100%': () => battleState.playerMaxHP,
            'heal+full': () => battleState.playerMaxHP,
            'full_heal': () => battleState.playerMaxHP
        };
        
        if (typeof supportEffects[card.effect] === 'function') {
            effect = Math.round(supportEffects[card.effect]());
        } else {
            effect = 20;
        }
        
        battleState.playerHP = Math.min(battleState.playerHP + effect, battleState.playerMaxHP);
        logMessage = `💊 ${gameState.character.name} sử dụng [${card.name}]! Hồi phục: ${effect} HP`;
    }
    
    addBattleLog(logMessage);
    updatePlayerHPBar();
    // Mark this support card as used for the current battle
    try { card._usedThisBattle = true; } catch (e) { /* ignore */ }
    
    // Set cooldown for this specific card (1 turn cooldown)
    battleState.cardCooldowns[cardIndex] = 1;
    
    // Advance to next turn
    if (battleState.turnOrder && battleState.turnOrder.length > 0) {
        advanceTurnOrder();
    } else {
        // Fallback for non-turn order battles
        battleState.round++;
        battleState.playerTurn = false;
        updateBattleActions();
    }
}

// Convert stat index to actual value
// F -> LR (indices 0-12): arithmetic progression (values 1-13)
// MR -> DX (indices 13-18): geometric progression with ratio 2
function getStatValue(index) {
    if (index <= 12) {
        // Arithmetic: F=0→1, E=1→2, ..., LR=12→13
        return index + 1;
    } else {
        // Geometric from MR (index 13)
        // MR: 13×2^0 = 13, X: 13×2^1 = 26, XX: 13×2^2 = 52, etc.
        return 13 * Math.pow(2, index - 13);
    }
}

// Calculate Damage
function calculateDamage(attackStat, defenseStat, type) {
    // Convert stat index to actual value
    const actualAttack = getStatValue(attackStat);
    const actualDefense = getStatValue(defenseStat);
    
    // Base formula: (Strength+1) × 2 - (Durability+1)
    let damage = (actualAttack * 2) - actualDefense;
    
    // Ensure minimum damage of 1
    damage = Math.max(1, damage);
    
    // Skill bonus: +50% damage for skills
    if (type === 'skill') {
        damage = damage * 1.5;
    }
    
    // Ensure minimum after skill bonus
    damage = Math.max(1, damage);
    
    // Add randomness (±30%)
    const variance = damage * 0.30;
    const randomModifier = (Math.random() * variance * 2 - variance);
    damage = damage + randomModifier;

    return Math.round(damage);
}

// Add Battle Log
function addBattleLog(message) {
    const battleLog = document.getElementById('battleLog');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    if (message.includes('sát thương')) {
        logEntry.classList.add('damage');
    } else if (message.includes('phòng thủ')) {
        logEntry.classList.add('defense');
    } else if (message.includes('kỹ năng')) {
        logEntry.classList.add('skill');
    }

    logEntry.textContent = message;
    battleLog.appendChild(logEntry);
    battleLog.scrollTop = battleLog.scrollHeight;
}

// Update HP Bars and visuals
function applyHPBarVisual(hpBar, percent) {
    if (!hpBar) return;
    const p = Math.max(0, Math.min(100, percent));
    hpBar.classList.remove('hp-green','hp-yellow','hp-red','hp-critical');
    if (p > 70) {
        hpBar.classList.add('hp-green');
    } else if (p > 40) {
        hpBar.classList.add('hp-yellow');
    } else if (p > 0) {
        hpBar.classList.add('hp-red','hp-critical');
    } else {
        // dead
        hpBar.classList.add('hp-red');
    }
}

function updatePlayerHPBar() {
    const hpPercent = (battleState.playerHP / battleState.playerMaxHP) * 100;
    const shieldPercent = (battleState.playerShield / battleState.playerMaxHP) * 100;
    
    const hpBar = document.getElementById('playerHPBar');
    const shieldBar = document.getElementById('playerShieldBar');
    const container = document.getElementById('playerHPContainer');
    
    if (hpBar) {
        hpBar.style.width = hpPercent + '%';
        applyHPBarVisual(hpBar, hpPercent);
    }
    
    if (shieldBar) {
        shieldBar.style.width = shieldPercent + '%';
        shieldBar.style.marginLeft = hpPercent + '%';
    }
    
    if (container) {
        const textDiv = container.querySelector('.hp-bar-text');
        if (textDiv) {
            textDiv.textContent = `${Math.round(battleState.playerHP)}/${battleState.playerMaxHP}${battleState.playerShield > 0 ? ` +🛡️${Math.round(battleState.playerShield)}` : ''}`;
        }
    }
}

function updateCrewHPBar(crewParticipantIdx) {
    if (!battleState.crewParticipants || !battleState.crewParticipants[crewParticipantIdx]) {
        return;
    }
    const participant = battleState.crewParticipants[crewParticipantIdx];
    const crewIndex = participant.crewIndex;
    
    const percent = (participant.hp / participant.maxHp) * 100;
    const hpBar = document.getElementById(`crewHPBar-${crewIndex}`);
    const hpText = document.getElementById(`crewHPText-${crewIndex}`);
    
    if (hpBar) {
        hpBar.style.width = percent + '%';
        applyHPBarVisual(hpBar, percent);
    }
    if (hpText) {
        hpText.textContent = `${Math.round(participant.hp)}/${participant.maxHp}`;
    }
}

function updateEnemyHPBar() {
    if (battleState.battleType === '2boss') {
        // Update both boss HP bars
        const percent1 = (battleState.boss1HP / battleState.boss1MaxHP) * 100;
        const percent2 = (battleState.boss2HP / battleState.boss2MaxHP) * 100;
        
        const hpBar1 = document.getElementById('boss1HPBar');
        const hpText1 = document.getElementById('boss1HPText');
        const hpBar2 = document.getElementById('boss2HPBar');
        const hpText2 = document.getElementById('boss2HPText');
        
        if (hpBar1) { hpBar1.style.width = percent1 + '%'; applyHPBarVisual(hpBar1, percent1); }
        if (hpText1) hpText1.textContent = `${Math.round(battleState.boss1HP)}/${battleState.boss1MaxHP}`;
        if (hpBar2) { hpBar2.style.width = percent2 + '%'; applyHPBarVisual(hpBar2, percent2); }
        if (hpText2) hpText2.textContent = `${Math.round(battleState.boss2HP)}/${battleState.boss2MaxHP}`;
    } else if (battleState.battleType === 'boss') {
        const percent = (battleState.enemyHP / battleState.enemyMaxHP) * 100;
        const hpBar = document.getElementById('bossHPBar');
        const hpText = document.getElementById('bossHPText');
        
        if (hpBar) {
            hpBar.style.width = percent + '%';
            applyHPBarVisual(hpBar, percent);
        }
        if (hpText) {
            const isQuest200 = battleState.currentQuestId === 200;
            if (isQuest200) {
                hpText.textContent = `??`;
            } else {
                hpText.textContent = `${Math.round(battleState.enemyHP)}/${battleState.enemyMaxHP}`;
            }
        }
    } else {
        // Update each minion HP bar
        if (!battleState.minionHPs || !battleState.minionMaxHPs) {
            return;
        }
        
        battleState.minionHPs.forEach((hp, idx) => {
            const maxHp = battleState.minionMaxHPs[idx] || 1;
            const percent = (hp / maxHp) * 100;
            
            const hpBar = document.getElementById(`minionHPBar-${idx}`);
            const hpContainer = document.getElementById(`minionHPContainer-${idx}`);
            
            if (hpBar) {
                const newWidth = `${Math.max(0, Math.min(100, percent))}%`;
                hpBar.style.width = newWidth;
                applyHPBarVisual(hpBar, percent);
            }
            
            if (hpContainer) {
                const hpText = hpContainer.querySelector('.hp-bar-text');
                if (hpText) {
                    hpText.textContent = `${Math.round(Math.max(0, hp))}/${maxHp}`;
                }
            }
        });
    }
}

// End Battle
function endBattle(isWin) {
    battleState.isActive = false;

    const battleLog = document.getElementById('battleLog');
    const currentQuest = gameState.quests.find(q => q.id === battleState.currentQuestId);
    
    // Special handling for Quest 200 (Unbeatable Ryu) - Player loses but quest completes
    if (!isWin && battleState.currentQuestId === 200) {
        addBattleLog('💔 Bạn thua trước Sigyeong Ryu... Nhưng kinh nghiệm này sẽ giúp bạn trưởng thành!');
        document.getElementById('battleActions').innerHTML = `
            <div class="battle-result success">
                <div class="result-title">⚔️ TRẬN THUA ⚔️</div>
                <div class="result-info">
                    <p>Bạn không thể hạ gục Sigyeong Ryu...</p>
                    <p>Nhưng kinh nghiệm từ trận chiến sẽ giúp bạn tiến bộ!</p>
                    <p>✅ Nhiệm vụ hoàn thành</p>
                </div>
                <button class="btn btn-success" onclick="endBattleAndContinue(true)">
                    ✅ Tiếp tục
                </button>
            </div>
        `;
        return;
    }
    
    // Check if quest should be completed on loss (quest #41)
    if (!isWin && currentQuest && currentQuest.completeOnLoss) {
        addBattleLog('🎉 Nhiệm vụ hoàn thành!');
        document.getElementById('battleActions').innerHTML = `
            <div class="battle-result success">
                <div class="result-title">✨ HOÀN THÀNH ✨</div>
                <div class="result-info">
                    <p>Bạn đã thua, nhưng thất bại này sẽ là kinh nghiệm cho bạn!</p>
                    <p>Nhận 100 điểm thưởng!</p>
                </div>
                <button class="btn btn-success" onclick="endBattleAndContinue(true)">
                    ✅ Tiếp tục
                </button>
            </div>
        `;
        return;
    }
    
    if (isWin) {
        if (battleState.battleType === 'minion') {
            // Check if there are any minions still alive
            const aliveMinionCount = battleState.minionHPs.filter(hp => hp > 0).length;
            const allMinionsDefeated = aliveMinionCount === 0;
            
            if (allMinionsDefeated) {
                // All minions defeated - show final victory modal
                addBattleLog('🎉 Bạn đã đánh bại tất cả thuộc hạ!');
                
                document.getElementById('victoryMessage').textContent = 'Bạn đã hoàn thành nhiệm vụ!';
                const victoryOverlay = document.getElementById('victoryOverlay');
                victoryOverlay.classList.add('show');
                
                // Keep the normal victory button
                document.querySelector('.victory-actions').innerHTML = `
                    <button class="btn btn-success btn-large" onclick="endBattleAndContinue(true)">
                        ✅ Tiếp tục
                    </button>
                `;
                return;
            } else {
                // Still have minions alive - this shouldn't happen in turn order system
                // But just in case, show continue button
                addBattleLog(`✅ Bạn đã đánh bại ${battleState.minions[battleState.currentMinionIndex].name}!`);
                
                document.getElementById('victoryMessage').textContent = `Bạn đã đánh bại ${battleState.minions[battleState.currentMinionIndex].name}!`;
                const victoryOverlay = document.getElementById('victoryOverlay');
                victoryOverlay.classList.add('show');
                
                // Replace button to show next minion
                document.querySelector('.victory-actions').innerHTML = `
                    <button class="btn btn-success btn-large" onclick="nextMinion(); document.getElementById('victoryOverlay').classList.remove('show');">
                        ➡️ Tiếp tục gặp thuộc hạ tiếp theo
                    </button>
                `;
                return;
            }
        } else {
            addBattleLog('🎉 THẮNG! Bạn đã đánh bại đối thủ!');
            
            document.getElementById('victoryMessage').textContent = 'Bạn đã hoàn thành nhiệm vụ!';
            const victoryOverlay = document.getElementById('victoryOverlay');
            victoryOverlay.classList.add('show');
            
            document.querySelector('.victory-actions').innerHTML = `
                <button class="btn btn-success btn-large" onclick="endBattleAndContinue(true)">
                    ✅ Tiếp tục
                </button>
            `;
        }
    } else {
        addBattleLog('💀 THUA! Bạn đã bị đánh bại!');
        document.getElementById('battleActions').innerHTML = `
            <div class="battle-result fail">
                <div class="result-title">💔 THẤT BẠI 💔</div>
                <div class="result-info">
                    <p>Bạn đã bị đánh bại!</p>
                    <p>Vui lòng thử lại!</p>
                </div>
                <button class="btn btn-danger" onclick="endBattleAndContinue(false)">
                    🔄 Làm lại
                </button>
            </div>
        `;
    }
}

// Next Minion (continue to next minion in battle)
function nextMinion() {
    console.log('nextMinion called, currentIndex=', battleState.currentMinionIndex);
    battleState.currentMinionIndex++;
    
    if (battleState.currentMinionIndex >= battleState.minions.length) {
        // All minions defeated - end battle
        console.log('All minions defeated!');
        endBattle(true);
        return;
    }

    // Reset for next minion
    const nextMinionObj = battleState.minions[battleState.currentMinionIndex];
    console.log('Switching to minion:', nextMinionObj.name);
    
    battleState.isActive = true; // ← FIX: Restart battle!
    battleState.enemyStats = {
        strength: nextMinionObj.stats[0],
        speed: nextMinionObj.stats[1],
        durability: nextMinionObj.stats[2]
    };

    battleState.enemyMaxHP = 60 + (getStatValue(battleState.enemyStats.durability) * 5);
    battleState.enemyHP = battleState.enemyMaxHP;
    
    battleState.round++;
    battleState.playerTurn = battleState.playerStats.speed >= battleState.enemyStats.speed;
    battleState.playerDefensing = false;
    
    console.log('Battle restarted with minion:', nextMinionObj.name, 'playerTurn=', battleState.playerTurn, 'isActive=', battleState.isActive);
    
    // Show battle screen
    showBattleScreen();
}

// End Battle And Continue
function endBattleAndContinue(isWin) {
    const questId = battleState.currentQuestId;
    
    // Hide victory modal and battle screen
    const victoryOverlay = document.getElementById('victoryOverlay');
    if (victoryOverlay) {
        victoryOverlay.classList.remove('show');
    }
    closeBattle();

    if (isWin) {
        // Mark quest as completed
        const quest = gameState.quests.find(q => q.id === questId);
        quest.completed = true;
        gameState.completedQuests++;
        gameState.totalPoints += quest.points + 100; // 100 bonus for winning

        // Auto-increase Intelligence slowly (every 3 quests) and Potential
        // Intelligence grows slowly: +1 every 3 quests
        if (gameState.completedQuests % STAT_CONFIG.INTELLIGENCE_QUEST_THRESHOLD === 0) {
            gameState.character.intelligence = Math.min(gameState.character.intelligence + 1, STAT_CONFIG.INTELLIGENCE_MAX);
        }
        
        // Potential grows based on quest points, capped at S (index 6)
        gameState.character.potential = Math.min(gameState.character.potential + Math.floor(quest.points / 50), STAT_CONFIG.POTENTIAL_MAX);

        // If this is a boss quest, grant the quest range rewards
        if (quest.boss || quest.bosses) {
            grantBossQuestRewards(quest.id);
        }

        // Process rewards with conditional logic for quest 200
        if (quest.rewards && quest.rewards.length > 0) {
            // Special handling for quest 200 based on choice from quest 199
            if (questId === 200) {
                const choice = gameState.questChoices[199];
                const rewards = [...quest.rewards]; // Copy array
                
                if (choice === 'jaeha') {
                    // Chose Jaeha: Defeated Ryu, get Diamond stat card + Jaeha joins crew
                    rewards.push({ type: 'stat', name: 'Thẻ Stat Kim Cương', rarity: 'diamond', effect: 'all_stats+3' });
                    if (!gameState.crew.some(c => c.name === 'Han Jaeha (Quân sư)')) {
                        gameState.crew.push({ name: 'Han Jaeha (Quân sư)', stats: [8, 8, 7] });
                    }
                    if (!gameState.crew.some(c => c.name === 'Kang Seok')) {
                        gameState.crew.push({ name: 'Kang Seok', stats: [7, 6, 8] });
                    }
                    addBattleLog('✨ Han Jaeha, Kang Seok tham gia Crew!');
                } else {
                    // Chose Ryu: Defeated Jaeha, get Platinum card (Jaeha doesn't join)
                    rewards.push({ type: 'stat', name: 'Thẻ Stat Bạch Kim', rarity: 'platinum', effect: 'speed+2' });
                }
                
                console.log(`Processing special rewards for quest ${questId}:`, rewards);
                rewards.forEach(reward => {
                    processReward(reward, questId);
                });
                console.log('Pending stat gains after processing rewards:', pendingStatGains);
                showRewardNotification(rewards);

                // If player chose Ryu, trigger ending storyline and end the game
                if (choice === 'ryu') {
                    endGame('Bạn đã chọn giúp Ryu, đồng nghĩa với việc bạn đã về dưới trướng phía Bắc, trò chơi kết thúc');
                    return; // stop normal post-victory flow
                }
            } else {
                console.log(`Processing rewards for quest ${questId}:`, quest.rewards);
                quest.rewards.forEach(reward => {
                    processReward(reward, questId);
                });
                console.log('Pending stat gains after processing rewards:', pendingStatGains);
                showRewardNotification(quest.rewards);
            }
        }

        // Check for breakthrough (which will handle stat gains after overlay)
        checkForBreakthrough(questId);
        
        alert('🎉 Nhiệm vụ hoàn thành!');
    } else {
        alert('💔 Bạn đã thua! ');
    }
}

// Close Battle
function closeBattle() {
    document.getElementById('battleScreen').classList.remove('active');
    battleState.isActive = false;
}

// ==================== QUEST CHALLENGES SYSTEM ====================
// ========== 1. QUICK TIME EVENT (QTE) ==========
function startQTEChallenge(questData) {
    challengeState = {
        active: true,
        type: CHALLENGE_TYPES.QTE,
        questId: questData.id,
        score: 0,
        attempts: 3,
        maxAttempts: 3,
        data: questData.challengeData || { rounds: 3, speed: 2000 }
    };
    
    showQTEInterface();
}

function showQTEInterface() {
    const modal = document.getElementById('modal');
    modal.classList.add('active');
    
    const html = `
        <div class="qte-challenge">
            <h3>⚡ Thử Thách Timing!</h3>
            <p>Nhấn khi thanh màu XANH di chuyển vào vùng TARGET!</p>
            ${challengeState.data && challengeState.data.flavor === 'bully' ? `<div style="margin-top:8px;padding:8px;background:rgba(241,196,15,0.06);border-left:4px solid #f1c40f;">👊 Đây là thử thách liên quan đến kẻ bắt nạt — xử lý khôn ngoan để giảm tổn thất.</div>` : ''}
            <div class="qte-attempts">
                Lượt còn lại: <span id="qteAttempts">${challengeState.attempts}</span>/3
            </div>
            <div class="qte-score">
                Điểm: <span id="qteScore">0</span>
            </div>
            
            <div class="qte-container">
                <div class="qte-target-zone"></div>
                <div class="qte-bar" id="qteBar"></div>
            </div>
            
            <button class="btn btn-primary" onclick="runQTERound()" id="qteStartBtn">
                🎯 Bắt Đầu
            </button>
            <button class="btn btn-danger" onclick="cancelChallenge()">
                ❌ Hủy
            </button>
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Thử Thách Quest';
    document.getElementById('modalBody').innerHTML = html;
}

function runQTERound() {
    if (challengeState.attempts <= 0) {
        finishQTEChallenge();
        return;
    }
    
    const bar = document.getElementById('qteBar');
    const startBtn = document.getElementById('qteStartBtn');
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Đang chạy...';
    
    let position = 0;
    const speed = challengeState.data.speed || 2000;
    const targetStart = 40; // 40-60% là target zone
    const targetEnd = 60;
    
    bar.style.left = '0%';
    
    const interval = setInterval(() => {
        position += 1;
        bar.style.left = position + '%';
        
        if (position >= 100) {
            clearInterval(interval);
            handleQTEMiss();
        }
    }, speed / 100);
    
    // Allow click to stop
    bar.onclick = () => {
        clearInterval(interval);
        const finalPosition = parseInt(bar.style.left);
        
        if (finalPosition >= targetStart && finalPosition <= targetEnd) {
            handleQTESuccess(finalPosition, targetStart, targetEnd);
        } else {
            handleQTEMiss();
        }
    };
}

function handleQTESuccess(position, targetStart, targetEnd) {
    const perfect = (targetStart + targetEnd) / 2;
    const distance = Math.abs(position - perfect);
    const maxDistance = (targetEnd - targetStart) / 2;
    const scoreGain = Math.round(100 * (1 - distance / maxDistance));
    
    challengeState.score += scoreGain;
    challengeState.attempts--;
    
    document.getElementById('qteScore').textContent = challengeState.score;
    document.getElementById('qteAttempts').textContent = challengeState.attempts;
    
    const bar = document.getElementById('qteBar');
    bar.style.backgroundColor = '#4CAF50';
    
    setTimeout(() => {
        bar.style.backgroundColor = '#2196F3';
        bar.style.left = '0%';
        bar.onclick = null;
        
        const startBtn = document.getElementById('qteStartBtn');
        startBtn.disabled = false;
        startBtn.textContent = challengeState.attempts > 0 ? '🎯 Tiếp Tục' : '✅ Hoàn Thành';
        
        if (challengeState.attempts <= 0) {
            finishQTEChallenge();
        }
    }, 800);
}

function handleQTEMiss() {
    challengeState.attempts--;
    
    document.getElementById('qteAttempts').textContent = challengeState.attempts;
    
    const bar = document.getElementById('qteBar');
    bar.style.backgroundColor = '#f44336';
    bar.onclick = null;
    
    setTimeout(() => {
        bar.style.backgroundColor = '#2196F3';
        bar.style.left = '0%';
        
        const startBtn = document.getElementById('qteStartBtn');
        startBtn.disabled = false;
        startBtn.textContent = challengeState.attempts > 0 ? '🔄 Thử Lại' : '❌ Hết Lượt';
        
        if (challengeState.attempts <= 0) {
            finishQTEChallenge();
        }
    }, 800);
}

function finishQTEChallenge() {
    const success = challengeState.score >= 150; // Cần ít nhất 150/300 điểm
    
    const resultHTML = `
        <div class="challenge-result ${success ? 'success' : 'fail'}">
            <h2>${success ? '✅ THÀNH CÔNG!' : '❌ THẤT BẠI!'}</h2>
            <p>Tổng điểm: ${challengeState.score}/300</p>
            <p>${success ? 'Bạn đã hoàn thành thử thách!' : 'Bạn cần ít nhất 150 điểm để pass.'}</p>
            <button class="btn ${success ? 'btn-success' : 'btn-warning'}" 
                    onclick="completeChallengeQuest(${success})">
                ${success ? '🎉 Nhận Thưởng' : '🔄 Thử Lại'}
            </button>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = resultHTML;
}

// ========== 2. MULTIPLE CHOICE QUIZ ==========
function startQuizChallenge(questData) {
    const modal = document.getElementById('modal');
    modal.classList.add('active');
    
    challengeState = {
        active: true,
        type: CHALLENGE_TYPES.QUIZ,
        questId: questData.id,
        score: 0,
        currentQuestion: 0,
        data: questData.challengeData || generateQuizQuestions(questData)
    };
    
    showQuizQuestion();
}

function generateQuizQuestions(questData) {
    // Use question bank and quest context to select non-repeating questions
    function getCategoriesFromQuest(q) {
        const title = (q.name || '').toLowerCase();
        const desc = (q.description || '').toLowerCase();
        const cats = new Set();
        if (/rèn luyện|luyện|tập|training|train/.test(title) || /rèn|luyện/.test(desc)) cats.add('training');
        if (/học|chiến thuật|strategy|chiến/.test(title) || /chiến/.test(desc)) cats.add('strategy');
        if (/bắt nạt|kẻ bắt nạt|bắtnạt|bully/.test(title) || /bắt nạt/.test(desc)) cats.add('bully');
        if (/chạy|tốc độ|speed|nhanh/.test(title) || /tốc độ/.test(desc)) cats.add('speed');
        if (/lén|ẩn|bí mật|stealth/.test(title) || /ẩn/.test(desc)) cats.add('stealth');
        if (cats.size === 0) cats.add('general');
        return Array.from(cats);
    }

    function pickQuestionsForCategories(categories, count) {
        const available = QUESTION_BANK.filter(q => categories.includes(q.cat) && !gameState.usedQuestionIds.includes(q.id));
        const chosen = [];
        // pick from available first
        while (chosen.length < count && available.length > 0) {
            const idx = Math.floor(Math.random() * available.length);
            chosen.push(available.splice(idx, 1)[0]);
        }
        // if not enough, fill with less-preferred or previously used ones (to avoid empty quizzes)
        if (chosen.length < count) {
            const fallback = QUESTION_BANK.filter(q => !categories.length || categories.includes(q.cat));
            while (chosen.length < count && fallback.length > 0) {
                const idx = Math.floor(Math.random() * fallback.length);
                const candidate = fallback.splice(idx, 1)[0];
                // avoid exact duplicates within this quiz
                if (!chosen.find(c => c.id === candidate.id)) chosen.push(candidate);
            }
        }
        return chosen;
    }

    const categories = getCategoriesFromQuest(questData);
    const selected = pickQuestionsForCategories(categories, 3);
    // mark used IDs
    selected.forEach(q => { if (!gameState.usedQuestionIds.includes(q.id)) gameState.usedQuestionIds.push(q.id); });

    // Return in format expected by quiz runner, include flavor if relevant
    const out = { questions: selected.map(q => ({ question: q.question, options: q.options })) };
    if (/bắt nạt|kẻ bắt nạt|bully/.test((questData.name || '') + ' ' + (questData.description || ''))) {
        out.flavor = 'bully';
    }
    return out;
}

function showQuizQuestion() {
    const question = challengeState.data.questions[challengeState.currentQuestion];
    
    const flavorHTML = challengeState.data && challengeState.data.flavor === 'bully' ?
        `<div style="margin-bottom:10px; padding:8px; background:rgba(231,76,60,0.08); border-left:4px solid #e74c3c;">⚠️ Chủ đề: Đối phó kẻ bắt nạt — chọn hành động khôn ngoan.</div>` : '';

    const html = `
        <div class="quiz-challenge">
            <div class="quiz-progress">
                Câu ${challengeState.currentQuestion + 1}/${challengeState.data.questions.length}
            </div>
            <div class="quiz-score">
                Điểm: <span id="quizScore">${challengeState.score}</span>
            </div>
            ${flavorHTML}
            <h3>${question.question}</h3>
            
            <div class="quiz-options">
                ${question.options.map((opt, idx) => `
                    <button class="btn btn-outline quiz-option" 
                            onclick="answerQuiz(${idx})">
                        ${opt.text}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = '📝 Câu Hỏi Chiến Thuật';
    document.getElementById('modalBody').innerHTML = html;
}

function answerQuiz(optionIndex) {
    const question = challengeState.data.questions[challengeState.currentQuestion];
    const selectedOption = question.options[optionIndex];
    
    challengeState.score += selectedOption.points;
    challengeState.currentQuestion++;
    
    if (challengeState.currentQuestion >= challengeState.data.questions.length) {
        finishQuizChallenge();
    } else {
        showQuizQuestion();
    }
}

function finishQuizChallenge() {
    const maxScore = challengeState.data.questions.reduce((sum, q) => 
        sum + Math.max(...q.options.map(o => o.points)), 0
    );
    const success = challengeState.score >= maxScore * 0.5; // 50% to pass
    
    const resultHTML = `
        <div class="challenge-result ${success ? 'success' : 'fail'}">
            <h2>${success ? '🎓 ĐẠT!' : '📖 CẦN HỌC THÊM!'}</h2>
            <p>Điểm số: ${challengeState.score}/${maxScore}</p>
            <p>${success ? 'Bạn đã trả lời tốt!' : 'Cần ít nhất 50% điểm để đạt.'}</p>
            <button class="btn ${success ? 'btn-success' : 'btn-warning'}" 
                    onclick="completeChallengeQuest(${success})">
                ${success ? '✅ Hoàn Thành' : '🔄 Làm Lại'}
            </button>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = resultHTML;
}

// ========== 3. TIMING CHALLENGE (Click Spam) ==========
function startTimingChallenge(questData) {
    const modal = document.getElementById('modal');
    modal.classList.add('active');
    
    challengeState = {
        active: true,
        type: CHALLENGE_TYPES.TIMING,
        questId: questData.id,
        score: 0,
        timeLeft: questData.challengeData?.timeLimit || 10,
        data: questData.challengeData || { target: 50, timeLimit: 10 }
    };
    
    showTimingInterface();
}

function showTimingInterface() {
    const html = `
        <div class="timing-challenge">
            <h3>⚡ Click Nhanh!</h3>
            <p>Click nút càng nhiều càng tốt trong thời gian giới hạn!</p>
            ${challengeState.data && challengeState.data.flavor === 'bully' ? `<div style="margin-top:8px;padding:8px;background:rgba(231,76,60,0.06);border-left:4px solid #e74c3c;">⚠️ Chủ đề: Kẻ bắt nạt — hoàn thành vượt trội để bảo vệ nạn nhân.</div>` : ''}
            
            <div class="timing-stats">
                <div>⏱️ Thời gian: <span id="timeLeft">${challengeState.timeLeft}</span>s</div>
                <div>🎯 Mục tiêu: ${challengeState.data.target} clicks</div>
                <div>📊 Hiện tại: <span id="clickCount">0</span> clicks</div>
            </div>
            
            <button class="btn btn-large btn-primary" id="clickButton" disabled>
                🎯 CLICK VÀO ĐÂY!
            </button>
            
            <button class="btn btn-success" onclick="startTimingRound()">
                ▶️ Bắt Đầu
            </button>
            <button class="btn btn-danger" onclick="cancelChallenge()">
                ❌ Hủy
            </button>
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Thử Thách Tốc Độ';
    document.getElementById('modalBody').innerHTML = html;
}

function startTimingRound() {
    const clickButton = document.getElementById('clickButton');
    clickButton.disabled = false;
    clickButton.onclick = incrementClickCount;
    
    // Hide start button
    event.target.style.display = 'none';
    
    // Start countdown
    const interval = setInterval(() => {
        challengeState.timeLeft--;
        document.getElementById('timeLeft').textContent = challengeState.timeLeft;
        
        if (challengeState.timeLeft <= 0) {
            clearInterval(interval);
            finishTimingChallenge();
        }
    }, 1000);
}

function incrementClickCount() {
    challengeState.score++;
    document.getElementById('clickCount').textContent = challengeState.score;
}

function finishTimingChallenge() {
    const success = challengeState.score >= challengeState.data.target;
    
    const resultHTML = `
        <div class="challenge-result ${success ? 'success' : 'fail'}">
            <h2>${success ? '⚡ NHANH NHƯ CHỚP!' : '🐌 CẦN NHANH HƠN!'}</h2>
            <p>Clicks: ${challengeState.score}/${challengeState.data.target}</p>
            <p>${success ? 'Tốc độ phản ứng tuyệt vời!' : 'Cần đạt mục tiêu để pass.'}</p>
            <button class="btn ${success ? 'btn-success' : 'btn-warning'}" 
                    onclick="completeChallengeQuest(${success})">
                ${success ? '✅ Hoàn Thành' : '🔄 Thử Lại'}
            </button>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = resultHTML;
}

// ========== CHALLENGE COMPLETION ==========
function completeChallengeQuest(success) {
    closeModal();
    
    if (!success) {
        // Retry challenge
        const quest = gameState.quests.find(q => q.id === challengeState.questId);
        if (quest.challengeType === CHALLENGE_TYPES.QTE) {
            startQTEChallenge(quest);
        } else if (quest.challengeType === CHALLENGE_TYPES.QUIZ) {
            startQuizChallenge(quest);
        } else if (quest.challengeType === CHALLENGE_TYPES.TIMING) {
            startTimingChallenge(quest);
        }
        return;
    }
    
    // Success - complete quest
    const quest = gameState.quests.find(q => q.id === challengeState.questId);
    
    // Modify rewards based on performance
    if (challengeState.score > 250 && quest.bonusRewards) {
        // Perfect score bonus
        quest.rewards.push(...quest.bonusRewards);
    }
    
    completeQuestDirectly(quest);
    challengeState.active = false;
}

function cancelChallenge() {
    closeModal();
    challengeState.active = false;
    alert('Đã hủy thử thách. Bạn có thể thử lại bất cứ lúc nào!');
}
// ==================== END QUEST CHALLENGES SYSTEM ====================

// Initialize when page loads
window.addEventListener('DOMContentLoaded', function() {
    initGame();
});
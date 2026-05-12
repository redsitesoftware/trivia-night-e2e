const QUESTIONS = [
  // Science
  {
    id: 1, category: 'Science',
    question: 'What is the chemical symbol for gold?',
    options: ['Au', 'Ag', 'Gd', 'Go'],
    answer: 0
  },
  {
    id: 2, category: 'Science',
    question: 'How many bones are in the adult human body?',
    options: ['196', '206', '216', '226'],
    answer: 1
  },
  {
    id: 3, category: 'Science',
    question: 'What planet is known as the Red Planet?',
    options: ['Venus', 'Jupiter', 'Mars', 'Saturn'],
    answer: 2
  },
  {
    id: 4, category: 'Science',
    question: 'What gas do plants absorb from the atmosphere?',
    options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
    answer: 2
  },
  {
    id: 5, category: 'Science',
    question: 'What is the speed of light (approx.) in km/s?',
    options: ['100,000', '300,000', '500,000', '1,000,000'],
    answer: 1
  },
  // History
  {
    id: 6, category: 'History',
    question: 'In what year did World War II end?',
    options: ['1943', '1944', '1945', '1946'],
    answer: 2
  },
  {
    id: 7, category: 'History',
    question: 'Who was the first President of the United States?',
    options: ['Thomas Jefferson', 'John Adams', 'Benjamin Franklin', 'George Washington'],
    answer: 3
  },
  {
    id: 8, category: 'History',
    question: 'Which ancient wonder was located in Alexandria?',
    options: ['Colossus of Rhodes', 'Lighthouse of Alexandria', 'Hanging Gardens', 'Statue of Zeus'],
    answer: 1
  },
  {
    id: 9, category: 'History',
    question: 'The Berlin Wall fell in what year?',
    options: ['1987', '1988', '1989', '1990'],
    answer: 2
  },
  {
    id: 10, category: 'History',
    question: 'Who painted the Mona Lisa?',
    options: ['Michelangelo', 'Raphael', 'Donatello', 'Leonardo da Vinci'],
    answer: 3
  },
  // Pop Culture
  {
    id: 11, category: 'Pop Culture',
    question: 'Which band released the album "Abbey Road"?',
    options: ['The Rolling Stones', 'The Beatles', 'Led Zeppelin', 'Pink Floyd'],
    answer: 1
  },
  {
    id: 12, category: 'Pop Culture',
    question: 'In what year was the first iPhone released?',
    options: ['2005', '2006', '2007', '2008'],
    answer: 2
  }
];

function getShuffledQuestions(count = 10) {
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

module.exports = { QUESTIONS, getShuffledQuestions };

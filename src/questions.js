'use strict';

/** @type {Array<{id: number, text: string, options: string[], answerIndex: number, category: string}>} */
const QUESTIONS = [
  // Science
  {
    id: 1,
    text: 'What is the chemical symbol for water?',
    options: ['H2O', 'CO2', 'NaCl', 'O2'],
    answerIndex: 0,
    category: 'Science',
  },
  {
    id: 2,
    text: 'How many bones are in the adult human body?',
    options: ['106', '206', '306', '406'],
    answerIndex: 1,
    category: 'Science',
  },
  {
    id: 3,
    text: 'What planet is known as the Red Planet?',
    options: ['Venus', 'Jupiter', 'Mars', 'Saturn'],
    answerIndex: 2,
    category: 'Science',
  },
  {
    id: 4,
    text: 'What is the speed of light (approx) in km/s?',
    options: ['150,000', '300,000', '450,000', '600,000'],
    answerIndex: 1,
    category: 'Science',
  },
  {
    id: 5,
    text: 'What gas do plants absorb from the atmosphere?',
    options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
    answerIndex: 2,
    category: 'Science',
  },
  {
    id: 6,
    text: 'Which element has the atomic number 1?',
    options: ['Helium', 'Lithium', 'Carbon', 'Hydrogen'],
    answerIndex: 3,
    category: 'Science',
  },

  // History
  {
    id: 7,
    text: 'In what year did World War II end?',
    options: ['1943', '1944', '1945', '1946'],
    answerIndex: 2,
    category: 'History',
  },
  {
    id: 8,
    text: 'Who was the first President of the United States?',
    options: ['John Adams', 'Thomas Jefferson', 'Benjamin Franklin', 'George Washington'],
    answerIndex: 3,
    category: 'History',
  },
  {
    id: 9,
    text: 'The Great Wall of China was primarily built during which dynasty?',
    options: ['Han', 'Tang', 'Ming', 'Qing'],
    answerIndex: 2,
    category: 'History',
  },
  {
    id: 10,
    text: 'In what year did the Berlin Wall fall?',
    options: ['1987', '1988', '1989', '1990'],
    answerIndex: 2,
    category: 'History',
  },
  {
    id: 11,
    text: 'Which ancient wonder was located in Alexandria?',
    options: ['Colossus of Rhodes', 'Lighthouse of Alexandria', 'Hanging Gardens', 'Statue of Zeus'],
    answerIndex: 1,
    category: 'History',
  },
  {
    id: 12,
    text: 'Who wrote the Magna Carta year it was signed?',
    options: ['1215', '1315', '1415', '1115'],
    answerIndex: 0,
    category: 'History',
  },
];

module.exports = { QUESTIONS };

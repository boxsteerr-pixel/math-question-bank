import crypto from 'node:crypto';

// Stage-B approvals are keyed by formal ID and bound to the reviewed question,
// answer and answerType. Changed content requires new per-question approval.
export const FACTORIZATION_CONSTRAINT_APPROVALS=Object.freeze({
  Q0163: "0ff0cbfa872239697c9abc480806b9cc05c4a94c76019135063b61b746b354e3",
  Q0164: "d0068ca26bc7cfbd5a107b23db39dc2170249f70ad45b822fadb39a29e2644c3",
  Q0165: "5593c8e3d2571dfb14e0032f95a8e7ba7421233e41ba08d2cdf7f9bdb383a8dc",
  Q0166: "6572d2dbdda0de98cd7075bd124d67af39b313d7048b3f6e277cc4740d4bf479",
  Q0167: "f56776e5a9fd0e0d4aea1daa0364465dd6146b0aebd51c814aedbc58373f7b9f",
  Q0168: "6a27beb9e99b5bb3e586d653db36d86e92c57df62eba8d7e966a38532276a87e",
  Q0169: "fc3fcdcf5501de2984e743754213f70abf7b26cd8d53311836dde87e352d1e1f",
  Q0170: "c3d561a460369715aa7a4482874683aa1ae665db58fb60c203f659a4280794bc",
  Q0171: "a53402630f1de3eefe7702104ec32f87166d9910f618b3afa14b6c1289c44a3f",
  Q0172: "5b50668570b4db850bce54c3ef1af061fed4f8e729809073578b1535c62551d8",
  Q0173: "ccd5093b53a5f3dc4af2319a96642dfbddd25178cefb19ac485f54f2989d4785",
  Q0174: "5559fb67fe29238be22300030dd2ebf49412e380d283ed8aa67d08f758722eac",
  Q0175: "6e194de82ed474e52741440448b000e5adcc0734400389b68a5e7ae1a6300e89",
  Q0176: "8be16ec9c306836aa4be345b3244c1bbff9bfad8bf0a671a73252fa8a64534ca",
  Q0177: "923da470b5b095d7d26f0ffbfa4ba3699995d919231015a39c9268502491cebd",
  Q0178: "c1600ddc385caf790c010ae3cee9482e2ce29294d7a813b21de3936455e7ecb7",
  Q0179: "6d4cbf760bfc1bcde5f52f3389f91a0193c37ca687860e2a115100eef3ffaafc",
});
export function applyApprovedFactorizationConstraint(question){
  const expected=FACTORIZATION_CONSTRAINT_APPROVALS[question.id];
  if(!expected)return question;
  const actual=crypto.createHash('sha256').update(JSON.stringify({question:question.question,answer:question.answer,answerType:question.answerType})).digest('hex');
  if(actual!==expected)throw Error(question.id+' factorization approval is stale; stop and review');
  return {...question,answerConstraint:'fully_factored',fullyFactored:true};
}

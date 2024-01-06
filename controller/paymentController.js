const stripe = require("stripe")(
  "sk_test_51OVFRiSGT3KoaOHlMb4nlEfMSZ2LdsaNWQuO1ct2hUwqwktlTx8WEOVOwCp1rPafJY7ta0BgDNgMZWTyJrm4r3Ra000Fse0GAR"
);

// Function to create a payment intent
async function createPaymentIntent(amount, currency = "inr") {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Convert amount to cents
      currency,
    });
    // amount: amount*100
    return paymentIntent;
  } catch (error) {
    console.error(error);
    throw new Error("Payment processing failed");
  }
}

module.exports = {
  createPaymentIntent,
};
